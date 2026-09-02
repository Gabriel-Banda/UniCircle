// SSE (Server-Sent Events) Manager for live notifications
import { randomUUID } from 'crypto';
import db from '../database/db.js';

// Map of userId -> Set of SSE response objects
const clients = new Map();

export function addClient(userId, res) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId).add(res);

  res.on('close', () => {
    const userClients = clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        clients.delete(userId);
      }
    }
  });
}

// Send live event to a specific user
export function sendToUser(userId, event, data) {
  const userClients = clients.get(userId);
  if (userClients && userClients.size > 0) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    userClients.forEach((res) => {
      try {
        res.write(message);
      } catch (err) {
        console.error('Error writing SSE message to client:', err);
      }
    });
  }
}

// Create notification in DB and push event
export function createNotification({
  userId,
  senderId = null,
  type,
  title,
  message,
  link = '',
}) {
  // Don't notify the user about their own actions
  if (userId === senderId) return null;

  const id = 'notif_' + randomUUID();
  try {
    db.prepare(`
      INSERT INTO notifications (id, user_id, sender_id, type, title, message, link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(id, userId, senderId, type, title, message, link);

    const notif = db.prepare(`
      SELECT n.*, u.name as sender_name, u.username as sender_username, u.avatar_color as sender_avatar_color
      FROM notifications n
      LEFT JOIN users u ON n.sender_id = u.id
      WHERE n.id = ?
    `).get(id);

    // Push live via SSE
    sendToUser(userId, 'notification', notif);
    return notif;
  } catch (err) {
    console.error('Failed to create notification:', err);
    return null;
  }
}

// Log user activity
export function logActivity({ userId, actionType, title, description = '', link = '' }) {
  const id = 'act_' + randomUUID();
  try {
    db.prepare(`
      INSERT INTO user_activity (id, user_id, action_type, title, description, link, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, userId, actionType, title, description, link);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
