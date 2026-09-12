import type { UserDocument } from './user.schema';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}
