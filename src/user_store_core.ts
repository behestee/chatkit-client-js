import User from './user';

export default class UserStoreCore {
  private users: Set<User>;

  constructor(users = new Set<User>()) {
    this.users = users;
  }

  addOrMerge(user: User): User {
    // TODO: Implement properly
    return user;
  }

  remove(id: string): User | undefined {
    // TODO: Implement properly
    return undefined;
  }
}