import { Role } from '../config/constants';

declare global {
  namespace Express {
    interface AuthAdmin {
      id: string;
      username: string;
      role: Role;
    }
    interface AuthStudent {
      id: string;
      email?: string;
      registrationNumber?: string;
    }
    interface Request {
      admin?: AuthAdmin;
      student?: AuthStudent;
      clientIp?: string;
    }
  }
}

export {};
