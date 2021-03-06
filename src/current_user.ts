import {
  Instance
} from 'pusher-platform';

import BasicMessage from './basic_message';
import BasicMessageEnricher from './basic_message_enricher';
import ChatManagerDelegate from './chat_manager_delegate';
import GlobalUserStore from './global_user_store';
import Message from './message';
import PayloadDeserializer from './payload_deserializer';
import PresenceSubscription from './presence_subscription';
import Room from './room';
import RoomDelegate from './room_delegate';
import RoomStore from './room_store';
import RoomSubscription from './room_subscription';


import { allPromisesSettled } from './utils';


export interface CreateRoomOptions {
  name: string;
  private?: boolean;
  addUserIds?: string[];
}

export interface UpdateRoomOptions {
  name?: string;
  isPrivate?: boolean;
}

export interface FetchRoomMessagesOptions {
  initialId?: string;
  limit?: number;
  direction?: string;
}



export interface CurrentUserOptions {
  id: string;
  createdAt: string;
  updatedAt: string;
  name?: string;
  avatarURL?: string;
  customData?: any; // TODO: Shouldn't be any (type)
  rooms?: Room[];
  instance: Instance;
  userStore: GlobalUserStore;
}

export default class CurrentUser {
  id: string;
  createdAt: string;
  updatedAt: string;
  name?: string;
  avatarURL?: string;
  customData?: any;
  userStore: GlobalUserStore;
  roomStore: RoomStore;
  instance: Instance;
  pathFriendlyId: string;
  presenceSubscription: PresenceSubscription;

  get rooms(): Room[] {
    return this.roomStore.rooms;
  }

  constructor(options: CurrentUserOptions) {
    const { rooms, id, instance } = options;
    const validRooms: Room[] = rooms || [];

    this.id = id;
    this.createdAt = options.createdAt;
    this.updatedAt = options.updatedAt;
    this.name = options.name;
    this.avatarURL = options.avatarURL;
    this.customData = options.customData;
    this.roomStore = new RoomStore({ instance, rooms: validRooms });
    this.instance = instance;
    this.userStore = options.userStore;
    this.pathFriendlyId = encodeURIComponent(id); // TODO: This is different to Swift SDK
  }

  updateWithPropertiesOf(currentUser: CurrentUser) {
    this.updatedAt = currentUser.updatedAt;
    this.name = currentUser.name;
    this.customData = currentUser.customData;
  }

  setupPresenceSubscription(delegate: ChatManagerDelegate) {
    this.presenceSubscription = new PresenceSubscription({
      instance: this.instance,
      userStore: this.userStore,
      roomStore: this.roomStore,
      delegate: delegate,
    });

    this.instance.subscribeNonResuming({
      path: `/users/${this.id}/presence`,
      listeners: {
        onEvent: this.presenceSubscription.handleEvent.bind(this.presenceSubscription),
      }
    })
  }

  createRoom(options: CreateRoomOptions, onSuccess: (room: Room) => void, onError: (error: any) => void) {
    var roomData = {
      name: options.name,
      created_by_id: this.id,
      private: options.private || false,
    }

    if (options.addUserIds && options.addUserIds.length > 0) {
      roomData['user_ids'] = options.addUserIds;
    }

    this.instance.request({
      method: 'POST',
      path: '/rooms',
      body: roomData,
    }).then(res => {
      const roomPayload = JSON.parse(res);
      const room = PayloadDeserializer.createRoomFromPayload(roomPayload);
      const addedOrMergedRoom = this.roomStore.addOrMerge(room);
      this.populateRoomUserStore(addedOrMergedRoom);
      onSuccess(addedOrMergedRoom);
    }).catch(error => {
      this.instance.logger.verbose(`Error creating room: ${error}`);
      onError(error);
    })
  }

  populateRoomUserStore(room: Room) {
    // TODO: Use the soon-to-be-created new version of fetchUsersWithIds from the userStore

    const userPromises = new Array<Promise<any>>();

    room.userIds.forEach(userId => {
      const userPromise = new Promise<any>((resolve, reject) => {
        this.userStore.user(
          userId,
          (user) => {
            room.userStore.addOrMerge(user)
            resolve();
          },
          (error) => {
            this.instance.logger.debug(`Unable to add user with id ${userId} to room \(room.name):: ${error}`);
            reject();
          }
        )
      })

      userPromises.push(userPromise);
    })

    allPromisesSettled(userPromises).then(() => {
      if (room.subscription === undefined) {
        this.instance.logger.verbose(`Room ${room.name} has no subscription object set`);
      } else {
        if (room.subscription.delegate && room.subscription.delegate.usersUpdated) {
          room.subscription.delegate.usersUpdated();
        }
      }

      this.instance.logger.verbose(`Users updated in room ${room.name}`);
    })
  }

  // addUser(user: User, room: Room, onSuccess: () => void, onError: (error: any) => void) {
  //   this.addUsers([user], room, onSuccess, onError);
  // }

  addUser(id: string, roomId: number, onSuccess: () => void, onError: (error: any) => void) {
    this.addOrRemoveUsers(roomId, [id], 'add', onSuccess, onError);
  }

  // addUsers(users: User[], room: Room, onSuccess: () => void, onError: (error: any) => void) {
  //   const userIds = users.map(el => el.id);
  //   this.addUsers(userIds, room.id, onSuccess, onError);
  // }

  // addUsers(ids: [string], roomId: number, onSuccess: () => void, onError: (error: any) => void) {
  //   this.addOrRemoveUsers(roomId, ids, 'add', onSuccess, onError);
  // }

  // removeUser(user: User, room: Room, onSuccess: () => void, onError: (error: any) => void) {
  //   this.removeUsers([user], room, onSuccess, onError);
  // }

  removeUser(id: string, roomId: number, onSuccess: () => void, onError: (error: any) => void) {
    this.addOrRemoveUsers(roomId, [id], 'remove', onSuccess, onError);
  }

  // removeUsers(users: [PCUser], room: Room, onSuccess: () => void, onError: (error: any) => void) {
  //   const userIds = users.map(el => el.id);
  //   this.removeUsers(userIds, room.id, onSuccess, onError);
  // }

  // removeUsers(ids: string[], roomId: number, onSuccess: () => void, onError: (error: any) => void) {
  //   this.addOrRemoveUsers(roomId, ids, 'remove', onSuccess, onError);
  // }

  // updateRoom(room: Room, options: UpdateRoomOptions, onSuccess: () => void, onError: (error: any) => void) {
  //   this.updateRoom(room.id, options, onSuccess, onError);
  // }

  // updateRoom(id: number, options: UpdateRoomOptions, onSuccess: () => void, onError: (error: any) => void) {
  //   this.updateRoom(id, options, onSuccess, onError);
  // }

  updateRoom(roomId: number, options: UpdateRoomOptions, onSuccess: () => void, onError: (error: any) => void) {
    if (options.name === undefined && options.isPrivate === undefined) {
      onSuccess();
      return;
    }

    var roomPayload = {};
    if (options.name) { roomPayload['name'] = options.name; }
    if (options.isPrivate) { roomPayload['private'] = options.isPrivate; }

    this.instance.request({
      method: 'PUT',
      path: `/rooms/${roomId}`,
      body: roomPayload,
    }).then(res => {
      onSuccess();
    }).catch(error => {
      this.instance.logger.verbose(`Error updating room ${roomId}: ${error}`);
      onError(error);
    })
  }

  // deleteRoom(room: Room, onSuccess: () => void, onError: (error: any) => void) {
  //   this.deleteRoom(room.id, onSuccess, onError);
  // }

  // deleteRoom(id: number, onSuccess: () => void, onError: (error: any) => void) {
  //   this.deleteRoom(id, onSuccess, onError);
  // }

  deleteRoom(roomId: number, onSuccess: () => void, onError: (error: any) => void) {
    this.instance.request({
      method: 'DELETE',
      path: `/rooms/${roomId}`,
    }).then(res => {
      onSuccess();
    }).catch(error => {
      this.instance.logger.verbose(`Error deleting room ${roomId}: ${error}`);
      onError(error);
    })
  }

  addOrRemoveUsers(roomId: number, userIds: string[], membershipChange: string, onSuccess: () => void, onError: (error: any) => void) {
    const usersPayload = {
      user_ids: userIds,
    }

    this.instance.request({
      method: 'PUT',
      path: `/rooms/${roomId}/users/${membershipChange}`,
      body: usersPayload,
    }).then(res => {
      onSuccess();
    }).catch(error => {
      this.instance.logger.verbose(`Error when attempting to ${membershipChange} users from room ${roomId}: ${error}`);
      onError(error);
    })
  }

  joinRoom(roomId: number, onSuccess: (room: Room) => void, onError: (error: any) => void) {
    this.instance.request({
      method: 'POST',
      path: `/users/${this.pathFriendlyId}/rooms/${roomId}/join`,
    }).then(res => {
      const roomPayload = JSON.parse(res);
      const room = PayloadDeserializer.createRoomFromPayload(roomPayload);
      const addedOrMergedRoom = this.roomStore.addOrMerge(room);
      // TODO: room or addedOrMergedRoom ?
      this.populateRoomUserStore(addedOrMergedRoom);
      onSuccess(addedOrMergedRoom);
    }).catch(error => {
      this.instance.logger.verbose(`Error joining room ${roomId}: ${error}`);
      onError(error);
    })
  }

  leaveRoom(roomId: number, onSuccess: () => void, onError: (error: any) => void) {
    this.instance.request({
      method: 'POST',
      path: `/users/${this.pathFriendlyId}/rooms/${roomId}/leave`,
    }).then(res => {
      // TODO: Remove room from roomStore or is that handle by UserSubscription?
      onSuccess();
    }).catch(error => {
      this.instance.logger.verbose(`Error leaving room ${roomId}: ${error}`);
      onError(error);
    })
  }

  getJoinedRooms(onSuccess: (rooms: Room[]) => void, onError: (error: any) => void) {
    this.getUserRooms(false, onSuccess, onError);
  }

  getJoinableRooms(onSuccess: (rooms: Room[]) => void, onError: (error: any) => void) {
    this.getUserRooms(true, onSuccess, onError);
  }

  getUserRooms(onlyJoinable: boolean, onSuccess: (rooms: Room[]) => void, onError: (error: any) => void) {
    const joinableQueryItemValue = onlyJoinable ? 'true' : 'false';
    this.getRooms(`/users/${this.pathFriendlyId}/rooms?joinable=${joinableQueryItemValue}`, onSuccess, onError);
  }

  getAllRooms(onSuccess: (rooms: Room[]) => void, onError: (error: any) => void) {
    this.getRooms('/rooms', onSuccess, onError);
  }

  private getRooms(path: string, onSuccess: (rooms: Room[]) => void, onError: (error: any) => void) {
    this.instance.request({
      method: 'GET',
      path: path,
    }).then(res => {
      const roomsPayload = JSON.parse(res);
      const rooms = roomsPayload.map((roomPayload) => {
        return PayloadDeserializer.createRoomFromPayload(roomPayload);
      })
      // TODO: filter if undefined returned?
      onSuccess(rooms);
    }).catch(error => {
      this.instance.logger.verbose(`Error when getting instance rooms: ${error}`);
      onError(error);
    })
  }

  // TODO: This shouldn't be an any for eventPayload
  private typingStateChange(eventPayload: any, roomId: number, onSuccess: () => void, onError: (error: any) => void) {
    this.instance.request({
      method: 'POST',
      path: `/rooms/${roomId}/events`,
      body: eventPayload,
    }).then(res => {
      onSuccess();
    }).catch(error => {
      this.instance.logger.verbose(`Error sending typing state change in room ${roomId}: ${error}`);
      onError(error);
    })
  }

  startedTypingIn(roomId: number, onSuccess: () => void, onError: (error: any) => void) {
    const eventPayload = {
      name: 'typing_start',
      user_id: this.id,
    };
    this.typingStateChange(eventPayload, roomId, onSuccess, onError);
  }

  stoppedTypingIn(roomId: number, onSuccess: () => void, onError: (error: any) => void) {
    const eventPayload = {
      name: 'typing_stop',
      user_id: this.id,
    };
    this.typingStateChange(eventPayload, roomId, onSuccess, onError);
  }

  addMessage(text: string, room: Room, onSuccess: (messageId: number) => void, onError: (error: any) => void) {
    const messageObject = {
      text: text,
      user_id: this.id,
    }

    this.instance.request({
      method: 'POST',
      path: `/rooms/${room.id}/messages`,
      body: messageObject,
    }).then(res => {
      const messageIdPayload = JSON.parse(res);
      const messageId = messageIdPayload.message_id;
      // TODO: Error handling
      onSuccess(messageId);
    }).catch(error => {
      this.instance.logger.verbose(`Error adding message to room ${room.name}: ${error}`);
      onError(error);
    })
  }

  // TODO: Do I need to add a Last-Event-ID option here?
  subscribeToRoom(room: Room, roomDelegate: RoomDelegate, messageLimit = 20) {
    room.subscription = new RoomSubscription({
      delegate: roomDelegate,
      basicMessageEnricher: new BasicMessageEnricher(
        this.userStore,
        room,
        this.instance.logger
      ),
      logger: this.instance.logger
    })

    // TODO: What happens if you provide both a message_limit and a Last-Event-ID?

    this.instance.subscribeNonResuming({
      path: `/rooms/${room.id}?message_limit=${messageLimit}`,
      listeners: {
        onEvent: room.subscription.handleEvent.bind(room.subscription),
      }
    })
  }

  fetchMessagesFromRoom(room: Room, fetchOptions: FetchRoomMessagesOptions, onSuccess: (messages: Message[]) => void, onError: (error: any) => void) {
    const initialIdQueryParam = fetchOptions.initialId ? `initial_id=${fetchOptions.initialId}` : '';
    const limitQueryParam = fetchOptions.limit ? `limit=${fetchOptions.limit}` : '';
    const directionQueryParam = fetchOptions.direction ? `direction=${fetchOptions.direction}` : 'direction=older';

    const combinedQueryParams = [
      initialIdQueryParam,
      limitQueryParam,
      directionQueryParam,
    ].join('&');

    this.instance.request({
      method: 'GET',
      path: `/rooms/${room.id}/messages`,
    }).then(res => {
      const messagesPayload = JSON.parse(res);

      var messages = new Array<Message>();
      var basicMessages = new Array<BasicMessage>();

      // TODO: Error handling
      const messageUserIds = messagesPayload.map(messagePayload => {
        const basicMessage = PayloadDeserializer.createBasicMessageFromPayload(messagePayload);
        basicMessages.push(basicMessage);
        return basicMessage.id;
      })

      const messageUserIdsSet = new Set<string>(messageUserIds);
      const userIdsToFetch = Array.from(messageUserIdsSet.values());

      this.userStore.fetchUsersWithIds(
        userIdsToFetch,
        (users) => {
          const messageEnricher = new BasicMessageEnricher(this.userStore, room, this.instance.logger);
          const enrichmentPromises = new Array<Promise<any>>();

          basicMessages.forEach(basicMessage => {
            const enrichmentPromise = new Promise<any>((resolve, reject) => {
              messageEnricher.enrich(
                basicMessage,
                (message) => {
                  messages.push(message);
                  resolve();
                },
                (error) => {
                  this.instance.logger.verbose(`Unable to enrich basic mesage ${basicMessage.id}: ${error}`);
                  reject();
                }
              )
            });

            enrichmentPromises.push(enrichmentPromise);
          })

          allPromisesSettled(enrichmentPromises).then(() => {
            if (room.subscription === undefined) {
              this.instance.logger.verbose(`Room ${room.name} has no subscription object set`);
            } else {
              if (room.subscription.delegate && room.subscription.delegate.usersUpdated) {
                room.subscription.delegate.usersUpdated();
              }
            }

            this.instance.logger.verbose(`Users updated in room ${room.name}`);

            onSuccess(messages.sort((msgOne, msgTwo) => msgOne.id - msgTwo.id));
          })
        },
        (error) => {
          this.instance.logger.verbose(`Error fetching users with ids ${userIdsToFetch}: ${error}`);
        }
      )
    }).catch(error => {
      this.instance.logger.verbose(`Error fetching messages froom room ${room.name}: ${error}`);
      onError(error);
    })
  }
}
