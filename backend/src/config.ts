import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 5000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
