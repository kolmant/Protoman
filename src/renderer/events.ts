import { initializeApp, ipcRenderer } from './index';
import { makeStore } from './redux/store';
import ipcChannels from '../ipc_channels';
import { ResponseDescriptor } from '../core/http_client/response';
import { RequestDescriptor } from '../core/http_client/request';
import { ProtoCtx } from '../core/protobuf/protobuf';
import { IpcRenderer } from 'electron';
import { message } from 'antd';
import { validateCollection } from './bulk/utils';
import { importCollection } from './bulk/BulkActions';
import { Store } from 'redux';

function setupListenersWithStore(ipcRenderer: IpcRenderer, store: Store): void {
  ipcRenderer.on(ipcChannels.IMPORT_SUCCESS, (event, [data]) => {
    const obj = JSON.parse(new TextDecoder().decode(data));
    const col = validateCollection(obj);
    if (col) {
      store.dispatch(importCollection(col));
      message.success('Import Success: Make sure the protofile paths are valid');
    } else {
      message.error('Import Error: Invalid collection format');
    }
  });
}

export function setupListeners(ipcRenderer: IpcRenderer): void {
  ipcRenderer.on(ipcChannels.LOAD_MOST_RECENT, (event, args) => {
    console.log('Loaded most recent state ', args);
    if (args[0] !== undefined) {
      const store = makeStore(args[0]);
      setupListenersWithStore(ipcRenderer, store);
      initializeApp(store);
    }
  });

  ipcRenderer.on(ipcChannels.MAIN_ERROR, (event, args) => {
    console.log('Error from the main process: ', args[0].message);
  });

  ipcRenderer.on(ipcChannels.EXPORT_CANCELLED, () => {
    message.warn('Export cancelled');
  });

  ipcRenderer.on(ipcChannels.EXPORT_SUCCESS, () => {
    message.success('Export success!');
  });

  ipcRenderer.on(ipcChannels.EXPORT_ERROR, (event, [e]) => {
    message.error(`Export error: ${JSON.stringify(e, null, 2)}`, 5);
  });

  ipcRenderer.on(ipcChannels.IMPORT_CANCELLED, () => {
    message.warn('Import cancelled');
  });

  ipcRenderer.on(ipcChannels.IMPORT_ERROR, (event, [e]) => {
    message.error(`Import error: ${JSON.stringify(e, null, 2)}`, 5);
  });
}

function setupResponseListeners(
  nonce: number,
  resolve: (rd: ResponseDescriptor) => void,
  reject: (e: Error) => void,
): void {
  const [onSuccess, onFailure] = [
    (evt: unknown, args: [number, ResponseDescriptor]): void => {
      if (args[0] === nonce) {
        ipcRenderer.removeListener(ipcChannels.REQUEST_SUCCESS, onSuccess);
        ipcRenderer.removeListener(ipcChannels.REQUEST_SUCCESS, onFailure);
        resolve(args[1]);
      }
    },
    (evt: unknown, args: [number, Error]): void => {
      if (args[0] === nonce) {
        ipcRenderer.removeListener(ipcChannels.REQUEST_SUCCESS, onSuccess);
        ipcRenderer.removeListener(ipcChannels.REQUEST_SUCCESS, onFailure);
        reject(args[1]);
      }
    },
  ];
  ipcRenderer.on(ipcChannels.REQUEST_SUCCESS, onSuccess);
  ipcRenderer.on(ipcChannels.REQUEST_FAILURE, onFailure);
}

export function makeRequest(request: RequestDescriptor, ctx: ProtoCtx): Promise<ResponseDescriptor> {
  return new Promise((resolve, reject) => {
    const nonce = Math.floor(Math.random() * 1e7);
    setupResponseListeners(nonce, resolve, reject);
    ipcRenderer.send(ipcChannels.SEND_REQUEST, [nonce, request, ctx]);
  });
}
