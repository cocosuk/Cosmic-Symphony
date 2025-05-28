// backend/src/auth.ts
import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from './db';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

type DBUser = {
  id: string;
  email: string;
  password: string;
  name: string | null;
};

// Register
router.post('/register', (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  prisma.user.findUnique({ where: { email } })
    .then((existing: DBUser | null) => {
      if (existing) {
        res.status(400).json({ message: 'Email already exists' });
        return; // <-- void return here
      }

      // hash & create
      return bcrypt.hash(password, 10)
        .then(hashed =>
          prisma.user.create({
            data: { email, password: hashed, name }
          })
        )
        .then((user: DBUser) => {
          const token = jwt.sign({ userId: user.id }, JWT_SECRET);
          res.json({ token });
        });
    })
    .catch((err: unknown) => {
      console.error(err);
      res.status(500).json({ message: 'Server error during registration' });
    });
});

// Login
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  prisma.user.findUnique({ where: { email } })
    .then((user: DBUser | null) => {
      if (!user) {
        res.status(400).json({ message: 'Invalid credentials' });
        return;
      }

      return bcrypt.compare(password, user.password)
        .then(isValid => {
          if (!isValid) {
            res.status(400).json({ message: 'Invalid credentials' });
            return;
          }
          const token = jwt.sign({ userId: user.id }, JWT_SECRET);
          res.json({ token });
        });
    })
    .catch((err: unknown) => {
      console.error(err);
      res.status(500).json({ message: 'Server error during login' });
    });
});

// Get user profile
router.get('/profile', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }
  const token = authHeader.split(' ')[1];

  let decoded: { userId: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    res.status(401).json({ message: 'Invalid token' });
    return;
  }

  prisma.user.findUnique({ where: { id: decoded.userId } })
    .then((user: DBUser | null) => {
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
      res.json({ email: user.email, name: user.name });
    })
    .catch((err: unknown) => {
      console.error(err);
      res.status(500).json({ message: 'Error loading profile' });
    });
});

// Update user name
router.put('/profile/name', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }
  const token = authHeader.split(' ')[1];

  let decoded: { userId: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    res.status(401).json({ message: 'Invalid token' });
    return;
  }

  const { name } = req.body;
  prisma.user.update({
    where: { id: decoded.userId },
    data: { name }
  })
    .then(() => {
      res.json({ message: 'Name updated' });
    })
    .catch((err: unknown) => {
      console.error(err);
      res.status(500).json({ message: 'Error updating name' });
    });
});

export default router;