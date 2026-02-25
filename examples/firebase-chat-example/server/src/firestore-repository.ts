/**
 * Firestore-backed RepositoryProvider for Tuplet agent.
 *
 * Stores conversation history and state in a single Firestore document
 * per conversationId under the `conversations` collection.
 */

import type { Firestore } from 'firebase-admin/firestore'
import type { RepositoryProvider, Message } from 'tuplet'

export class FirestoreRepository implements RepositoryProvider {
  private db: Firestore
  private collection: string

  constructor(db: Firestore, collection = 'conversations') {
    this.db = db
    this.collection = collection
  }

  async getHistory(conversationId: string): Promise<Message[]> {
    const doc = await this.db.collection(this.collection).doc(conversationId).get()
    if (!doc.exists) return []
    const data = doc.data()
    return (data?.history as Message[]) ?? []
  }

  async saveHistory(conversationId: string, messages: Message[]): Promise<void> {
    await this.db.collection(this.collection).doc(conversationId).set(
      {
        history: messages,
        updatedAt: new Date().toISOString(),
        messageCount: messages.length,
      },
      { merge: true }
    )
  }

  async getState(conversationId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.db.collection(this.collection).doc(conversationId).get()
    if (!doc.exists) return null
    return (doc.data()?.state as Record<string, unknown>) ?? null
  }

  async saveState(conversationId: string, state: Record<string, unknown>): Promise<void> {
    await this.db.collection(this.collection).doc(conversationId).set(
      { state },
      { merge: true }
    )
  }
}
