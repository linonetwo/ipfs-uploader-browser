import React, { Component } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';

import IPFS from 'ipfs';
import { Buffer } from 'buffer';
import streamBuffers from 'stream-buffers';

const ProgressBar = styled.div`
  width: ${props => ((props.progress || 0) / props.total * 130).toFixed(1)}px;
  height: 20px;
  background-color: #66ccff;
  position: absolute;
  left: 9px;
  top: 10px;
`;

export default class FileUploadInput extends Component {
  static propTypes = {
    readAs: PropTypes.oneOf(['readAsDataURL', 'readAsArrayBuffer', 'readAsBinaryString', 'readAsText']),
    onReadSuccess: PropTypes.func.isRequired,
    onReadFailure: PropTypes.func.isRequired,
    allowMultiple: PropTypes.bool,
    validateFiles: PropTypes.func,
    initialText: PropTypes.string,
    inputProps: PropTypes.object,
    fileInputProps: PropTypes.object,
  };

  static defaultProps = {
    readAs: 'readAsArrayBuffer',
    allowMultiple: false,
    validateFiles: files => null,
    initialText: '',
    inputProps: {},
    fileInputProps: {},
  };

  node: any;
  stream: any;

  state = {
    progress: 0,
    totalFileSize: 0,
  };

  constructor(props) {
    super(props);
    this.state = { text: props.initialText, files: [] };

    // 用随机的仓库地址（IPFS 在本地缓存数据的地方）来初始化 IPFS 节点
    const repoPath = 'ipfs-' + Math.random();
    this.node = new IPFS({ repo: repoPath });

    // 节点完成初始化并开始连接其他节点后会触发 ready 事件
    this.node.on('ready', () => console.log('Online status: ', this.node.isOnline() ? 'online' : 'offline'));
  }

  /** 3.把文件丢进 IPFS 里 */
  uploadIPFS = (fileArrayBuffer: ArrayBuffer): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
      // 先设置进度条到 0 的位置
      this.setState({ progress: 0 });
      // 创建用于修改进度条进度的流
      const myReadableStreamBuffer = new streamBuffers.ReadableStreamBuffer({
        chunkSize: 25000, // 决定了传输速率
      });
      // 修改进度条进度
      myReadableStreamBuffer.on('data', (chunk: Buffer) => {
        this.setState({ progress: this.state.progress + chunk.byteLength });
        myReadableStreamBuffer.resume();
      });

      // 创建 IPFS 读写文件的流，这是一个 Duplex 流，可读可写
      this.stream = this.node.files.addReadableStream();
      // 文件上传完毕后 resolve 这个 Promise
      this.stream.on('data', (file: Buffer) => resolve(file));

      // 对接好两个流，并开始上传
      this.stream.write(myReadableStreamBuffer);
      myReadableStreamBuffer.put(Buffer.from(fileArrayBuffer));

      // 上传完毕后关闭流
      myReadableStreamBuffer.on('end', () => this.stream.end());
      myReadableStreamBuffer.stop();
    });
  };

  /** 2.中转文件，准备丢进 IPFS */
  readFile(file) {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = event => resolve(this.uploadIPFS(event.target.result));
      fileReader.onerror = reject;
      fileReader[this.props.readAs](file);
    });
  }

  /** 清空显示的文本和暂存在 <input/> 里的文件 */
  resetState() {
    this.setState({ text: '', files: [] });
  }

  /** 1.从 <input/> 元素获取文件 */
  async handleChange(event: SyntheticInputEvent<EventTarget>) {
    // 处理取文件的各种意外情况
    const files: File[] = Array.from(event.target.files);
    if (!files.length) {
      return this.resetState();
    }
    const errMsg = this.props.validateFiles(files);
    if (errMsg) {
      this.resetState();
      return this.props.onReadFailure(errMsg);
    }

    // 更新显示的文件名
    const text = files.length > 1 ? `${files.length} files...` : files[0].name;
    this.setState({ text, files });

    // 先计算文件的总大小，用于进度条
    let totalFileSize = 0;
    files.forEach(file => {
      totalFileSize += file.size;
    });
    this.setState({ totalFileSize });
    // 调用上传文件的函数
    try {
      const response = await Promise.all([...files.map(aFile => this.readFile(aFile))]);
      this.props.onReadSuccess(response);
    } catch (err) {
      this.resetState();
      this.props.onReadFailure(err.message);
    }
  }

  render() {
    return (
      <span className={this.props.className}>
        {/* 用于显示文件名的 input */}
        <input
          placeholder={this.props.allowMultiple ? 'Select files' : 'Select a file'}
          value={this.state.text}
          readOnly
          onClick={() => this.fileInput.click()}
          {...this.props.inputProps}
        />
        {/* 用于放置文件对象的 input，因为样式比较丑，不让它显示 */}
        <input
          style={{ display: 'none' }}
          ref={el => (this.fileInput = el)}
          type="file"
          multiple={this.props.allowMultiple}
          onChange={e => this.handleChange(e)}
          {...this.props.fileInputProps}
        />
        <ProgressBar progress={this.state.progress} total={this.state.totalFileSize} />
      </span>
    );
  }
}
