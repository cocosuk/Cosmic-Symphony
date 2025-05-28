// backend/src/routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import prisma from './db';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router: Router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

// Extend Request with user field
interface AuthRequest extends Request {
  user?: { userId: string };
}

type DBGeneration = {
  id: string;
  userId: string;
  regionKey: string;
  stars: any;        // stored JSON
  date: Date;
};

// Middleware to verify JWT
const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.user = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// GET /generations - list all by user
router.get(
  '/generations',
  authMiddleware,
  (req: AuthRequest, res: Response) => {
    prisma.generation
      .findMany({
        where: { userId: req.user!.userId },
        orderBy: { date: 'desc' },
      })
      .then((generations: DBGeneration[]) => {
        res.json(generations);
      })
      .catch((err: any) => {
        console.error(err);
        res.status(500).json({ message: 'Error loading generations' });
      });
  }
);

// GET /generations/:id - single
router.get(
  '/generations/:id',
  authMiddleware,
  (req: AuthRequest, res: Response) => {
    prisma.generation
      .findUnique({ where: { id: req.params.id } })
      .then((generation: DBGeneration | null) => {
        if (!generation) {
          return res.status(404).json({ message: 'Generation not found' });
        }
        res.json(generation);
      })
      .catch((err: any) => {
        console.error(err);
        res.status(500).json({ message: 'Error fetching generation' });
      });
  }
);

// POST /generations - create
router.post(
  '/generations',
  authMiddleware,
  (req: AuthRequest, res: Response) => {
    const { regionKey, stars } = req.body;
    prisma.generation
      .create({
        data: {
          userId: req.user!.userId,
          regionKey,
          stars,
        },
      })
      .then((created: DBGeneration) => {
        res.json(created);
      })
      .catch((err: any) => {
        console.error(err);
        res.status(500).json({ message: 'Error saving generation' });
      });
  }
);

// PUT /generations/:id - update
router.put(
  '/generations/:id',
  authMiddleware,
  (req: AuthRequest, res: Response) => {
    const { regionKey, stars } = req.body;
    prisma.generation
      .update({
        where: { id: req.params.id },
        data: { regionKey, stars },
      })
      .then((updated: DBGeneration) => {
        res.json(updated);
      })
      .catch((err: any) => {
        console.error(err);
        res.status(500).json({ message: 'Error updating generation' });
      });
  }
);

// DELETE /generations/:id - delete one
router.delete(
  '/generations/:id',
  authMiddleware,
  (req: AuthRequest, res: Response) => {
    prisma.generation
      .delete({ where: { id: req.params.id } })
      .then(() => {
        res.json({ message: 'Deleted' });
      })
      .catch((err: any) => {
        console.error(err);
        res.status(500).json({ message: 'Error deleting generation' });
      });
  }
);

// DELETE /generations - delete all for user
router.delete(
  '/generations',
  authMiddleware,
  (req: AuthRequest, res: Response) => {
    prisma.generation
      .deleteMany({ where: { userId: req.user!.userId } })
      .then(() => {
        res.json({ message: 'All deleted' });
      })
      .catch((err: any) => {
        console.error(err);
        res.status(500).json({ message: 'Error deleting all generations' });
      });
  }
);

export default router;