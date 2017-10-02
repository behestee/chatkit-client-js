import {
  Instance,
  TokenProvider,
  Logger,
  BaseClient,
} from 'pusher-platform';

import GlobalUserStore from './global_user_store';
import UserSubscription from './user_subscription';
import CurrentUser from './current_user';

export interface ChatManagerOptions {
  instanceId: string;
  tokenProvider: TokenProvider;
  logger?: Logger;
  baseClient?: BaseClient;
}

export default class ChatManager {
  private instance: Instance;
  private userSubscription: UserSubscription;
  private userStore: GlobalUserStore;
  tokenProvider: TokenProvider;

  constructor(options: ChatManagerOptions) {
    // if (!logger && logLevel) {
    //   logger = new PusherPlatform.ConsoleLogger(logLevel);
    // }

    this.tokenProvider = options.tokenProvider;

    this.instance = new Instance({
      instanceId: options.instanceId,
      serviceName: 'chatkit',
      serviceVersion: 'v1',
      // TODO: logger,
    });

    this.userStore = new GlobalUserStore({ instance: this.instance });
  }

  connect(options: ConnectOptions) {
    console.log("Let's connect yeah");

    this.userSubscription = new UserSubscription({
      instance: this.instance,
      userStore: this.userStore,
      connectCompletionHandler: (currentUser, err) => {
        console.log("Connect completion handler called: ", currentUser, err);
      }
    });

    this.instance.subscribeNonResuming({
      path: '/users',
      tokenProvider: this.tokenProvider,
      listeners: {
        onEvent: this.userSubscription.handleEvent,
      }
    })
  }
}

export interface ConnectOptions {
  onSuccess: (currentUser: CurrentUser) => void;
  onError: (error: any) => void;
}