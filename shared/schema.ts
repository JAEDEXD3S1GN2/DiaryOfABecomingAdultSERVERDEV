import { pgTable, text, serial, integer, boolean, timestamp, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, isNotNull } from "drizzle-orm";


export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").default("user").notNull(), // 'admin' or 'user'
  blogsOpened: integer("blogs_opened").default(0),
  commentsMade: integer("comments_made").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  genre: text("genre").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  videoUrl: text("video_url"),
  images: text("images").array(),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  dislikes: integer("dislikes").default(0),
  authorId: integer("author_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  postId: integer("post_id").references(() => blogPosts.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const homeImages = pgTable("home_images", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  type: text("type").notNull(), // 'home', 'about', 'icon'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ===== NEW TRACKING TABLES =====

/**
 * Tracks user votes (likes/dislikes) on blog posts
 * Ensures one vote per user per post
 * Allows vote changes (like → dislike or vice versa)
 */
export const userPostVotes = pgTable(
  "user_post_votes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    postId: integer("post_id")
      .references(() => blogPosts.id, { onDelete: "cascade" })
      .notNull(),
    voteType: text("vote_type").notNull(), // 'like' | 'dislike'
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    // Ensures one engagement per user per post
    uniqueUserPost: uniqueIndex("unique_user_post_vote_idx")
      .on(table.userId, table.postId),
  })
);

/**
 * Tracks favorited blog posts by users
 * Shows which posts a user has marked as favorite
 * Maintains count of favorited posts per user
 */
export const userFavorites = pgTable(
  "user_favorites",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    postId: integer("post_id")
      .references(() => blogPosts.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    // Ensures a post is favorited only once per user
    uniqueUserFavorite: uniqueIndex("unique_user_favorite_idx")
      .on(table.userId, table.postId),
  })
);

/**
 * Tracks views per user per post
 * Prevents counting the same user multiple times for the same post
 */
export const postViews = pgTable(
  "post_views",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .references(() => blogPosts.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"), // For tracking anonymous users
    userAgent: text("user_agent"), // Browser/device info
    viewedAt: timestamp("viewed_at").defaultNow(),
  },
  (table) => ({
    // Quick lookup for views per user per post
    userPostIdx: uniqueIndex("unique_user_post_view_idx")
      .on(table.postId, table.userId)
  })
);

/**
 * Admin analytics table
 * Stores aggregated data for admin dashboard
 * Tracks: total users, posts, comments, messages
 * Links to actual message content
 */
export const adminAnalytics = pgTable("admin_analytics", {
  id: serial("id").primaryKey(),
  totalUsers: integer("total_users").default(0),
  totalPosts: integer("total_posts").default(0),
  totalComments: integer("total_comments").default(0),
  totalMessages: integer("total_messages").default(0),
  totalViews: integer("total_views").default(0),
  totalLikes: integer("total_likes").default(0),
  totalDislikes: integer("total_dislikes").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Relations for Drizzle ORM
 */

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(blogPosts),
  comments: many(comments),
  votes: many(userPostVotes),
  favorites: many(userFavorites),
  views: many(postViews),
}));

export const blogPostsRelations = relations(blogPosts, ({ one, many }) => ({
  author: one(users, {
    fields: [blogPosts.authorId],
    references: [users.id],
  }),
  comments: many(comments),
  votes: many(userPostVotes),
  favorites: many(userFavorites),
  views: many(postViews),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  post: one(blogPosts, {
    fields: [comments.postId],
    references: [blogPosts.id],
  }),
}));

export const userPostVotesRelations = relations(userPostVotes, ({ one }) => ({
  user: one(users, {
    fields: [userPostVotes.userId],
    references: [users.id],
  }),
  post: one(blogPosts, {
    fields: [userPostVotes.postId],
    references: [blogPosts.id],
  }),
}));

export const userFavoritesRelations = relations(userFavorites, ({ one }) => ({
  user: one(users, {
    fields: [userFavorites.userId],
    references: [users.id],
  }),
  post: one(blogPosts, {
    fields: [userFavorites.postId],
    references: [blogPosts.id],
  }),
}));

export const postViewsRelations = relations(postViews, ({ one }) => ({
  post: one(blogPosts, {
    fields: [postViews.postId],
    references: [blogPosts.id],
  }),
  user: one(users, {
    fields: [postViews.userId],
    references: [users.id],
  }),
}));

/**
 * Zod Schemas for validation
 */
export const insertUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
});

export const insertBlogPostSchema = z.object({
  title: z.string(),
  description: z.string(),
  genre: z.string(),
  thumbnailUrl: z.string().optional().nullable(),
  videoUrl: z.string().optional().nullable(),
  images: z.array(z.string()).optional().nullable(),
  authorId: z.number().optional().nullable(),
});

export const insertCommentSchema = z.object({
  content: z.string(),
  userId: z.number(),
  postId: z.number(),
});

export const insertMessageSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
  message: z.string(),
});

export const insertUserPostVoteSchema = z.object({
  userId: z.number(),
  postId: z.number(),
  voteType: z.string(),
});

export const insertUserFavoriteSchema = z.object({
  userId: z.number(),
  postId: z.number(),
});

export const insertPostViewSchema = z.object({
  postId: z.number(),
  userId: z.number().optional().nullable(),
  ipAddress: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
});

export const insertAdminAnalyticsSchema = z.object({
  totalUsers: z.number().optional(),
  totalPosts: z.number().optional(),
  totalComments: z.number().optional(),
  totalMessages: z.number().optional(),
  totalViews: z.number().optional(),
  totalLikes: z.number().optional(),
  totalDislikes: z.number().optional(),
});
