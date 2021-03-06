/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IPCServer, ClientConnectionEvent } from 'vs/base/parts/ipc/node/ipc';
import { Protocol } from 'vs/base/parts/ipc/node/ipc.electron';
import { ipcMain } from 'electron';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';

interface IIPCEvent {
	event: { sender: Electron.WebContents; };
	message: Buffer | null;
}

function createScopedOnMessageEvent(senderId: number, eventName: string): Event<Buffer | null> {
	const onMessage = Event.fromNodeEventEmitter<IIPCEvent>(ipcMain, eventName, (event, message) => ({ event, message }));
	const onMessageFromSender = Event.filter(onMessage, ({ event }) => event.sender.id === senderId);
	return Event.map(onMessageFromSender, ({ message }) => message);
}

export class Server extends IPCServer {

	private static Clients = new Map<number, IDisposable>();

	private static getOnDidClientConnect(): Event<ClientConnectionEvent> {
		const onHello = Event.fromNodeEventEmitter<Electron.WebContents>(ipcMain, 'ipc:hello', ({ sender }) => sender);

		return Event.map(onHello, webContents => {
			const id = webContents.id;
			const client = Server.Clients.get(id);

			if (client) {
				client.dispose();
			}

			const onDidClientReconnect = new Emitter<void>();
			Server.Clients.set(id, toDisposable(() => onDidClientReconnect.fire()));

			const onMessage = createScopedOnMessageEvent(id, 'ipc:message') as Event<Buffer>;
			const onDidClientDisconnect = Event.any(Event.signal(createScopedOnMessageEvent(id, 'ipc:disconnect')), onDidClientReconnect.event);
			const protocol = new Protocol(webContents, onMessage);

			return { protocol, onDidClientDisconnect };
		});
	}

	constructor() {
		super(Server.getOnDidClientConnect());
	}
}