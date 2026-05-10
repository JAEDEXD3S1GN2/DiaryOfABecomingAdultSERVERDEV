/**
 * ROUTE IMPLEMENTATIONS FOR NEW ENDPOINTS
 * 
 * Add these route handlers to your routes/index.ts file
 * Make sure to import the necessary tables and dependencies
 */
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "./shared/routes";
import { z } from "zod";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import jwt from "jsonwebtoken";
import { requireAdmin } from "./middlewares/admin";
import { db } from "./db";
import { users, blogPosts, messages, comments, userPostVotes, userFavorites } from "./shared/schema";
import multer from "multer";
import "dotenv/config";
import { eq, and, count } from 'drizzle-orm';
import cors from "cors";

const scryptAsync = promisify(scrypt);

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}


/*
 * ============================================================
 * USER VOTE ENDPOINTS
 * ============================================================
 */

/**
 * GET /api/posts/:id/user-vote
 * 
 * Returns whether the authenticated user has liked or disliked a post
 * Used to persist button states across page reloads
 * 
 * Authentication: Required (token)
 * Response: { userLiked: boolean, userDisliked: boolean }
 * 
 * 
 */

const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    (req as any).user = user;
    next();
  });
};

const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

import swaggerUi from "swagger-ui-express";
import { specs } from "./swagger";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // --- Swagger Documentation ---
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));


app.get("/api/posts/:id/user-vote", authenticateToken, async (req: Request, res: Response) => {
  const postId = Number(req.params.id);
  const userId = (req as any).user.id;

  try {
    // Verify post exists
    const post = await db.select().from(blogPosts).where(eq(blogPosts.id, postId));
    if (!post[0]) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if user has voted on this post
    const vote = await db
      .select()
      .from(userPostVotes)
      .where(
        and(
          eq(userPostVotes.userId, userId),
          eq(userPostVotes.postId, postId)
        )
      );

    res.status(200).json({
      userLiked: vote[0]?.voteType === "like" || false,
      userDisliked: vote[0]?.voteType === "dislike" || false,
    });
  } catch (err) {
    console.error("Error fetching user vote:", err);
    res.status(500).json({ message: "Failed to fetch user vote status" });
  }
});

 /**
   * @openapi
   * /api/auth/register:
   *   post:
   *     summary: Register a new user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, email, password]
   *             properties:
   *               name: { type: string }
   *               email: { type: string }
   *               password: { type: string }
   *     responses:
   *       201:
   *         description: User created successfully
   */
  app.post(api.auth.register.path, async (req, res) => {
    try {
      const input = api.auth.register.input.parse(req.body);
      const existingUser = await storage.getUserByEmail(input.email);
      if (existingUser) return res.status(400).json({ message: "Email already exists" });
      const hashedPassword = await hashPassword(input.password);
      const user = await storage.createUser({ ...input, password: hashedPassword });
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
      res.status(201).json({ token, user });
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  /**
   * @openapi
   * /api/auth/login:
   *   post:
   *     summary: Login user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email: { type: string }
   *               password: { type: string }
   *     responses:
   *       200:
   *         description: Login successful
   */
  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await storage.getUserByEmail(input.email);
      if (!user || !(await comparePasswords(input.password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
      console.log("SIGN SECRET:", process.env.JWT_SECRET);
      res.json({ token, user });
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  /**
   * @openapi
   * /api/posts:
   *   get:
   *     summary: Get all blog posts
   *     tags: [Posts]
   *     responses:
   *       200:
   *         description: List of blog posts
   */

  /**
 * @openapi
 * /api/posts:
 *   post:
 *     summary: Create a new blog post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, genre]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               genre:
 *                 type: string
 *               thumbnailUrl:
 *                 type: string
 *               videoUrl:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Post created successfully
 */
  app.post(
    api.posts.create.path,
    authenticateToken,
    isAdmin,
    async (req, res) => {
      try {
        const input = api.posts.create.input.parse(req.body);

        const newPost = await db
          .insert(blogPosts)
          .values({
            title: req.body.title,
            description: req.body.description,
            genre: req.body.genre,
            authorId: req.body.authorId,
          })
          .returning();

        res.status(201).json(newPost[0]);
      } catch (error) {
        console.error(error);
        res.status(400).json({ message: "Failed to create post" });
      }
    }
  );

  /**
   * @openapi
   * /api/posts/{id}:
   *   patch:
   *     summary: Update a blog post
   *     tags: [Posts]
   *     security:
   *       - bearerAuth: []
   */
  app.patch(api.posts.update.path, authenticateToken, isAdmin, async (req: Request, res: Response) => {
    const postId = Number(req.params.id);
    const updates = req.body;

    try {
      const updatedPost = await db.update(blogPosts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(blogPosts.id, postId))
        .returning();

      if (!updatedPost[0]) return res.status(404).json({ message: "Post not found" });
      res.json(updatedPost[0]);
    } catch (err) {
      res.status(400).json({ message: "Failed to update post" });
    }
  });

  /**
   * @openapi
   * /api/posts/{id}/like:
   *   post:
   *     summary: Like a blog post
   *     tags: [Posts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Post liked successfully
   *       404:
   *         description: Post not found
   */
  app.post(api.posts.like.path, async (req: Request, res: Response) => {
    const postId = Number(req.params.id);

    try {
      const post = await db.select().from(blogPosts).where(eq(blogPosts.id, postId));

      if (!post[0]) {
        return res.status(404).json({ message: "Post not found" });
      }

      const updatedPost = await db.update(blogPosts)
        .set({ likes: post[0].likes + 1 })
        .where(eq(blogPosts.id, postId))
        .returning();

      res.status(200).json({
        likes: updatedPost[0].likes,
        message: "Post liked successfully"
      });
    } catch (err) {
      console.error(err);
      res.status(400).json({ message: "Failed to like post" });
    }
  });

  /**
   * @openapi
   * /api/posts/{id}/dislike:
   *   post:
   *     summary: Dislike a blog post
   *     tags: [Posts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Post disliked successfully
   *       404:
   *         description: Post not found
   */
  app.post(api.posts.dislike.path, async (req: Request, res: Response) => {
    const postId = Number(req.params.id);

    try {
      const post = await db.select().from(blogPosts).where(eq(blogPosts.id, postId));

      if (!post[0]) {
        return res.status(404).json({ message: "Post not found" });
      }

      const updatedPost = await db.update(blogPosts)
        .set({ dislikes: post[0].dislikes + 1 })
        .where(eq(blogPosts.id, postId))
        .returning();

      res.status(200).json({
        dislikes: updatedPost[0].dislikes,
        message: "Post disliked successfully"
      });
    } catch (err) {
      console.error(err);
      res.status(400).json({ message: "Failed to dislike post" });
    }
  });

  /**
   * @openapi
   * /api/posts/{id}/view:
   *   post:
   *     summary: Record a view for a blog post
   *     tags: [Posts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: View recorded successfully
   *       404:
   *         description: Post not found
   */
  app.post(api.posts.recordView.path, async (req: Request, res: Response) => {
    const postId = Number(req.params.id);

    try {
      const post = await db.select().from(blogPosts).where(eq(blogPosts.id, postId));

      if (!post[0]) {
        return res.status(404).json({ message: "Post not found" });
      }

      const updatedPost = await db.update(blogPosts)
        .set({ views: post[0].views + 1 })
        .where(eq(blogPosts.id, postId))
        .returning();

      res.status(200).json({
        views: updatedPost[0].views,
        message: "View recorded successfully"
      });
    } catch (err) {
      console.error(err);
      res.status(400).json({ message: "Failed to record view" });
    }
  });

  /**
   * @openapi
   * /api/posts/{postId}/comments:
   *   get:
   *     summary: Get comments for a blog post
   *     tags: [Comments]
   *     parameters:
   *       - in: path
   *         name: postId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: List of comments
   */
  // --- GET /api/posts/:postId/comments (Get comments) ---
  app.get(api.comments.list.path, async (req: Request, res: Response) => {
    const postId = Number(req.params.postId);

    try {
      const postComments = await db.select().from(comments)
        .where(eq(comments.postId, postId));

      // Get user info for each comment
      const commentsWithUsers = await Promise.all(
        postComments.map(async (comment) => ({
          ...comment,
          user: await storage.getUser(comment.userId)
        }))
      );

      res.json(commentsWithUsers);
    } catch (err) {
      console.error(err);
      res.status(400).json({ message: "Failed to fetch comments" });
    }
  });

  /**
   * @openapi
   * /api/posts/{postId}/comments:
   *   post:
   *     summary: Add comment to blog post
   *     tags: [Comments]
   */
  // --- POST /api/posts/:postId/comments (Add comment) ---
  app.post(api.comments.create.path, authenticateToken, async (req: Request, res: Response) => {
    const postId = Number(req.params.postId);
    const userId = (req as any).user.id;
    const { content } = req.body;

    try {
      const newComment = await db.insert(comments)
        .values({ postId, userId, content })
        .returning();

      res.status(201).json(newComment[0]);
    } catch (err) {
      res.status(400).json({ message: "Failed to create comment" });
    }
  });

  /**
   * @openapi
   * /api/comments/{id}:
   *   delete:
   *     summary: Delete comment
   *     tags: [Comments]
   */
  // --- DELETE /api/comments/:id (Delete comment) ---
  app.delete(api.comments.delete.path, authenticateToken, async (req: Request, res: Response) => {
    const commentId = Number(req.params.id);
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    try {
      const comment = await db.select().from(comments).where(eq(comments.id, commentId));

      if (!comment[0]) return res.status(404).json({ message: "Comment not found" });

      // Only author of comment or admin can delete
      if (comment[0].userId !== userId && userRole !== "admin") {
        return res.status(403).json({ message: "Not authorized to delete this comment" });
      }

      await db.delete(comments).where(eq(comments.id, commentId));
      res.status(204).send();
    } catch (err) {
      res.status(400).json({ message: "Failed to delete comment" });
    }
  });

  app.patch(api.comments.update.path, authenticateToken, async (req: Request, res: Response) => {
    const commentId = Number(req.params.id);
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { content } = req.body;

    try {
      const comment = await db.select().from(comments).where(eq(comments.id, commentId));

      if (!comment[0]) return res.status(404).json({ message: "Comment not found" });

      // Only the author of the comment or an admin can edit
      if (comment[0].userId !== userId && userRole !== "admin") {
        return res.status(403).json({ message: "Not authorized to edit this comment" });
      }

      const [updated] = await db
        .update(comments)
        .set({ content })
        .where(eq(comments.id, commentId))
        .returning();

      res.status(200).json(updated);
    } catch (err) {
      res.status(400).json({ message: "Failed to update comment" });
    }
  });  


  app.get(api.posts.list.path, async (req, res) => {
    const posts = await storage.getBlogPosts(req.query.genre as string);
    res.json(posts);
  });

  /**
   * @openapi
   * /api/posts/{id}:
   *   get:
   *     summary: Get a blog post by ID
   *     tags: [Posts]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Blog post details
   */
  app.get(api.posts.get.path, async (req, res) => {
    const post = await storage.getBlogPost(Number(req.params.id));
    if (!post) return res.status(404).json({ message: "Post not found" });
    const author = post.authorId ? await storage.getUser(post.authorId) : null;
    if (author) await storage.incrementUserBlogs(author.id);
    res.json({ ...post, author });
  });

  /**
   * @openapi
   * /api/contact:
   *   post:
   *     summary: Send a contact message
   *     tags: [Contact]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [fullName, email, message]
   *             properties:
   *               fullName: { type: string }
   *               email: { type: string }
   *               message: { type: string }
   *     responses:
   *       201:
   *         description: Message sent successfully
   */
  app.post(api.messages.create.path, async (req, res) => {
    try {
      const input = api.messages.create.input.parse(req.body);
      const message = await storage.createMessage(input);
      res.status(201).json(message);
    } catch (err) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get(api.messages.list.path, authenticateToken, isAdmin, async (req, res) => {
    const messages = await storage.getMessages();
    res.json(messages);
  });

  // --- Image Routes ---
  app.get(api.images.list.path, async (req, res) => {
    const images = await storage.getHomeImages(req.query.type as string);
    res.json(images);
  });

  // app.get("/api/admin/dashboard", requireAdmin, async (req, res) => {
  //   try {
  //     const allUsers = await db.select().from(users);
  //     const allPosts = await db.select().from(blogPosts);
  //     const allMessages = await db.select().from(messages);
  //     const allComments = await db.select().from(comments);

  //     res.status(200).json({
  //       users: allUsers,
  //       posts: allPosts,
  //       messages: allMessages,
  //       comments: allComments,
  //     });
  //   } catch (error) {
  //     res.status(500).json({ message: "Something went wrong" });
  //   }
  // });

  



/**
 * POST /api/posts/:id/like (UPDATED)
 * 
 * Toggles like on a post
 * If user already liked, removes like
 * If user disliked, changes to like
 * If no vote, adds like
 * 
 * Authentication: Required (token)
 * Response: { likes, dislikes, userLiked, userDisliked, message }
 */
app.post("/api/posts/:id/like", authenticateToken, async (req: Request, res: Response) => {
  const postId = Number(req.params.id);
  const userId = (req as any).user.id;

  try {
    // Verify post exists
    const post = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, postId));

    if (!post[0]) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check existing vote
    const existingVote = await db
      .select()
      .from(userPostVotes)
      .where(
        and(
          eq(userPostVotes.userId, userId),
          eq(userPostVotes.postId, postId)
        )
      );

    let newLikes = post[0].likes;
    let newDislikes = post[0].dislikes;

    if (existingVote[0]) {
      // User has existing vote
      if (existingVote[0].voteType === "like") {
        // User already liked, remove the like (toggle off)
        await db
          .delete(userPostVotes)
          .where(
            and(
              eq(userPostVotes.userId, userId),
              eq(userPostVotes.postId, postId)
            )
          );
        newLikes = Math.max(0, post[0].likes - 1);
      } else {
        // User disliked, change to like
        await db
          .update(userPostVotes)
          .set({ voteType: "like", updatedAt: new Date() })
          .where(
            and(
              eq(userPostVotes.userId, userId),
              eq(userPostVotes.postId, postId)
            )
          );
        newLikes = post[0].likes + 1;
        newDislikes = Math.max(0, post[0].dislikes - 1);
      }
    } else {
      // No existing vote, create new like
      await db.insert(userPostVotes).values({
        userId,
        postId,
        voteType: "like",
      });
      newLikes = post[0].likes + 1;
    }

    // Update post counts
    const updatedPost = await db
      .update(blogPosts)
      .set({
        likes: newLikes,
        dislikes: newDislikes,
      })
      .where(eq(blogPosts.id, postId))
      .returning();

    res.status(200).json({
      likes: updatedPost[0].likes,
      dislikes: updatedPost[0].dislikes,
      userLiked: newLikes > post[0].likes || existingVote[0]?.voteType !== "like",
      userDisliked: false,
      message: "Post engagement updated successfully"
    });
  } catch (err) {
    console.error("Error liking post:", err);
    res.status(500).json({ message: "Failed to like post" });
  }
});

/**
 * POST /api/posts/:id/dislike (UPDATED)
 * 
 * Toggles dislike on a post
 * If user already disliked, removes dislike
 * If user liked, changes to dislike
 * If no vote, adds dislike
 * 
 * Authentication: Required (token)
 * Response: { likes, dislikes, userLiked, userDisliked, message }
 */
app.post("/api/posts/:id/dislike", authenticateToken, async (req: Request, res: Response) => {
  const postId = Number(req.params.id);
  const userId = (req as any).user.id;

  try {
    // Verify post exists
    const post = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, postId));

    if (!post[0]) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check existing vote
    const existingVote = await db
      .select()
      .from(userPostVotes)
      .where(
        and(
          eq(userPostVotes.userId, userId),
          eq(userPostVotes.postId, postId)
        )
      );

    let newLikes = post[0].likes;
    let newDislikes = post[0].dislikes;

    if (existingVote[0]) {
      // User has existing vote
      if (existingVote[0].voteType === "dislike") {
        // User already disliked, remove the dislike (toggle off)
        await db
          .delete(userPostVotes)
          .where(
            and(
              eq(userPostVotes.userId, userId),
              eq(userPostVotes.postId, postId)
            )
          );
        newDislikes = Math.max(0, post[0].dislikes - 1);
      } else {
        // User liked, change to dislike
        await db
          .update(userPostVotes)
          .set({ voteType: "dislike", updatedAt: new Date() })
          .where(
            and(
              eq(userPostVotes.userId, userId),
              eq(userPostVotes.postId, postId)
            )
          );
        newDislikes = post[0].dislikes + 1;
        newLikes = Math.max(0, post[0].likes - 1);
      }
    } else {
      // No existing vote, create new dislike
      await db.insert(userPostVotes).values({
        userId,
        postId,
        voteType: "dislike",
      });
      newDislikes = post[0].dislikes + 1;
    }

    // Update post counts
    const updatedPost = await db
      .update(blogPosts)
      .set({
        likes: newLikes,
        dislikes: newDislikes,
      })
      .where(eq(blogPosts.id, postId))
      .returning();

    res.status(200).json({
      likes: updatedPost[0].likes,
      dislikes: updatedPost[0].dislikes,
      userLiked: false,
      userDisliked: newDislikes > post[0].dislikes || existingVote[0]?.voteType !== "dislike",
      message: "Post engagement updated successfully",
    });
  } catch (err) {
    console.error("Error disliking post:", err);
    res.status(500).json({ message: "Failed to dislike post" });
  }
});

/**
 * ============================================================
 * FAVORITE ENDPOINTS
 * ============================================================
 */

/**
 * POST /api/posts/:id/favorite
 * 
 * Adds or removes a post from user's favorites
 * Toggles favorite status
 * 
 * Authentication: Required (token)
 * Response: { isFavorited: boolean, favoriteCount: number, message: string }
 */
app.post("/api/posts/:id/favorite", authenticateToken, async (req: Request, res: Response) => {
  const postId = Number(req.params.id);
  const userId = (req as any).user.id;

  try {
    // Verify post exists
    const post = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, postId));

    if (!post[0]) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Check if already favorited
    const existingFavorite = await db
      .select()
      .from(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.postId, postId)
        )
      );

    let isFavorited = false;

    if (existingFavorite[0]) {
      // Remove from favorites
      await db
        .delete(userFavorites)
        .where(
          and(
            eq(userFavorites.userId, userId),
            eq(userFavorites.postId, postId)
          )
        );
    } else {
      // Add to favorites
      await db.insert(userFavorites).values({
        userId,
        postId,
      });
      isFavorited = true;
    }

    // Get updated favorite count for this post
    const favoriteCount = await db
      .select({ count: count() })
      .from(userFavorites)
      .where(eq(userFavorites.postId, postId));

    res.status(200).json({
      isFavorited,
      favoriteCount: favoriteCount[0]?.count || 0,
      message: isFavorited ? "Added to favorites" : "Removed from favorites",
    });
  } catch (err) {
    console.error("Error toggling favorite:", err);
    res.status(500).json({ message: "Failed to update favorite" });
  }
});

/**
 * DELETE /api/posts/:id/favorite
 * 
 * Removes a post from user's favorites
 * 
 * Authentication: Required (token)
 * Response: { isFavorited: false, favoriteCount: number, message: string }
 */
app.delete("/api/posts/:id/favorite", authenticateToken, async (req: Request, res: Response) => {
  const postId = Number(req.params.id);
  const userId = (req as any).user.id;

  try {
    // Verify post exists
    const post = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, postId));

    if (!post[0]) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Remove from favorites
    await db
      .delete(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.postId, postId)
        )
      );

    // Get updated favorite count
    const favoriteCount = await db
      .select({ count: count() })
      .from(userFavorites)
      .where(eq(userFavorites.postId, postId));

    res.status(200).json({
      isFavorited: false,
      favoriteCount: favoriteCount[0]?.count || 0,
      message: "Removed from favorites",
    });
  } catch (err) {
    console.error("Error removing favorite:", err);
    res.status(500).json({ message: "Failed to remove favorite" });
  }
});

/**
 * GET /api/users/:userId/favorites
 * 
 * Returns all favorited posts for a user
 * Includes full post details and author information
 * 
 * Authentication: Not required
 * Response: Array of posts with author details
 */
app.get("/api/users/:userId/favorites", async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);

  try {
    // Verify user exists
    const user = await db.select().from(users).where(eq(users.id, userId));
    if (!user[0]) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get all favorited posts for this user
    const favoriteRecords = await db
      .select({
        postId: userFavorites.postId,
      })
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId));

    // Get full post details for each favorite
    const favoritedPosts = await Promise.all(
      favoriteRecords.map(async (fav) => {
        const post = await db
          .select()
          .from(blogPosts)
          .where(eq(blogPosts.id, fav.postId));

        if (post[0] && post[0].authorId) {
          const author = await db
            .select()
            .from(users)
            .where(eq(users.id, post[0].authorId));

          return {
            ...post[0],
            author: author[0] || null,
            isFavorited: true,
          };
        }

        return {
          ...post[0],
          author: null,
          isFavorited: true,
        };
      })
    );

    res.status(200).json(favoritedPosts);
  } catch (err) {
    console.error("Error fetching user favorites:", err);
    res.status(500).json({ message: "Failed to fetch favorites" });
  }
});

app.get("/api/posts/:id/favourite-status", authenticateToken, async (req, res) => {
  const postId = Number(req.params.id);
  const userId = (req as any).user.id;

  const existing = await db
    .select()
    .from(userFavorites)
    .where(and(eq(userFavorites.userId, userId), eq(userFavorites.postId, postId)));

  res.status(200).json({ isFavorited: !!existing[0] });
});

/**
 * ============================================================
 * USER PROFILE ENDPOINT
 * ============================================================
 */

/**
 * GET /api/users/:userId/profile
 * 
 * Returns complete user profile including:
 * - User basic info (name, email, stats)
 * - Favorite posts with full details
 * 
 * Authentication: Not required
 * Response: User profile object with favorites array
 */
app.get("/api/users/:userId/profile", async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);

  try {
    // 1. Get user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user[0]) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Get favourite count
    const favoriteCount = await db
      .select({ count: count() })
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId));

    // 3. Get favourite post IDs
    const favoriteRecords = await db
      .select({ postId: userFavorites.postId })
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId));

    // 4. Fetch each favourited post with its author — null safe
    const favoritesPosts = await Promise.all(
      favoriteRecords.map(async (fav) => {
        try {
          const post = await db
            .select()
            .from(blogPosts)
            .where(eq(blogPosts.id, fav.postId));

          if (!post[0]) return null; // post was deleted

          let author = null;
          if (post[0].authorId) {
            const authorResult = await db
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(eq(users.id, post[0].authorId));
            author = authorResult[0] ?? null;
          }

          return {
            id: post[0].id,
            title: post[0].title,
            description: post[0].description,
            genre: post[0].genre,
            thumbnailUrl: post[0].thumbnailUrl ?? null,
            views: post[0].views ?? 0,
            likes: post[0].likes ?? 0,
            dislikes: post[0].dislikes ?? 0,
            author,
          };
        } catch {
          return null; // skip any single post that fails
        }
      })
    );

    // 5. Filter out any nulls from deleted posts
    const cleanedFavourites = favoritesPosts.filter(Boolean);

    res.status(200).json({
      id: user[0].id,
      name: user[0].name,
      email: user[0].email,
      blogsOpened: user[0].blogsOpened ?? 0,
      commentsMade: user[0].commentsMade ?? 0,
      favoriteCount: Number(favoriteCount[0]?.count ?? 0),
      createdAt: user[0].createdAt,
      favoritesPosts: cleanedFavourites,
    });

  } catch (error) {
    console.error("Profile route error:", error); // ← check your terminal for the real message
    res.status(500).json({ message: "Failed to fetch user profile" });
  }
});

/**
 * ============================================================
 * ADMIN ANALYTICS ENDPOINT (UPDATED)
 * ============================================================
 */

/**
 * GET /api/admin/dashboard (UPDATED)
 * 
 * Returns comprehensive admin dashboard data including:
 * - All users, posts, messages, comments
 * - Analytics: total counts, likes, dislikes, views
 * 
 * Authentication: Required (admin role)
 * Response: Complete dashboard object with analytics
 */
app.get("/api/admin/dashboard", requireAdmin, async (req: Request, res: Response) => {
  try {
    const allUsers = await db.select().from(users);
    const allPosts = await db.select().from(blogPosts);
    const allMessages = await db.select().from(messages);
    const allComments = await db.select().from(comments);

    // ✅ Use ?? 0 to handle null values from the database
    const totalViews = allPosts.reduce((sum, post) => sum + (post.views ?? 0), 0);
    const totalLikes = allPosts.reduce((sum, post) => sum + (post.likes ?? 0), 0);
    const totalDislikes = allPosts.reduce((sum, post) => sum + (post.dislikes ?? 0), 0);

    const analytics = {
      totalUsers: allUsers.length,
      totalPosts: allPosts.length,
      totalComments: allComments.length,
      totalMessages: allMessages.length,
      totalViews,
      totalLikes,
      totalDislikes,
    };

    res.status(200).json({
      users: allUsers,
      posts: allPosts,
      messages: allMessages,
      comments: allComments,
      analytics,
    });

  } catch (error) {
    console.error("Admin dashboard error:", error); // ✅ This will show the real error
    res.status(500).json({ message: "Failed to fetch dashboard" });
  }
});
return httpServer;
}

/**
 * ============================================================
 * DATABASE MIGRATION SQL
 * ============================================================
 * 
 * Run these migrations to create the new tables:
 * 
 * CREATE TABLE user_post_votes (
 *   id SERIAL PRIMARY KEY,
 *   user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *   post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
 *   vote_type TEXT NOT NULL,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   UNIQUE(user_id, post_id)
 * );
 * 
 * CREATE TABLE user_favorites (
 *   id SERIAL PRIMARY KEY,
 *   user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *   post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   UNIQUE(user_id, post_id)
 * );
 * 
 * CREATE TABLE admin_analytics (
 *   id SERIAL PRIMARY KEY,
 *   total_users INTEGER DEFAULT 0,
 *   total_posts INTEGER DEFAULT 0,
 *   total_comments INTEGER DEFAULT 0,
 *   total_messages INTEGER DEFAULT 0,
 *   total_views INTEGER DEFAULT 0,
 *   total_likes INTEGER DEFAULT 0,
 *   total_dislikes INTEGER DEFAULT 0,
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 * 
 * CREATE INDEX idx_user_post_votes_user ON user_post_votes(user_id);
 * CREATE INDEX idx_user_post_votes_post ON user_post_votes(post_id);
 * CREATE INDEX idx_user_favorites_user ON user_favorites(user_id);
 * CREATE INDEX idx_user_favorites_post ON user_favorites(post_id);
 */
