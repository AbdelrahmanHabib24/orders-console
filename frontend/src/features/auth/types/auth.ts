export type UserRole = 'ADMIN' | 'AGENT';

export interface User {
  email: string;
  role: UserRole;
}
