# Firestore Security Specification: Zalo-like Messaging App

## 1. Data Invariants

1. **User Ownership**: A user document is only writeable by the authenticated user whose `uid` matches the document key.
2. **Strict Friendships**: Friendship records require both `user1Id` and `user2Id` to exist and the request must originate from one of these users.
3. **Immutability of Chat Members**: Members cannot manipulate other chat participants' details arbitrarily without chat association. Access is granted only to members within the same chat.
4. **Message Integrity**: A message cannot be spoofed; the `senderId` field in the message body must strictly match the `uid` of the authenticated user sending it.
5. **Call Validity**: Only participants of the designated room/call (`callerId` or `receiverId`) can read or write call signaling documents.
6. **Temporal Accuracy**: `createdAt` and `updatedAt` can only be set to `request.time`.

---

## 2. The "Dirty Dozen" Payloads (Identity, Integrity, and State Violations)

1. **Spoofed User Creation**: Attacker tries to write a user bio with key `attacker_uid` using auth uid `victim_uid`.
2. **Ghost field Injection**: Creation of a user profile containing are-you-admin `isAdmin: true` system-generated mock field.
3. **Impersonate Message**: Attacker sends a message in a chat with `senderId: "victim_id"` but auth uid is `"attacker_id"`.
4. **Read Unauthorized Messages**: Attacker attempts list/get on `/chats/private_chat_1/messages` when they are not a member of `private_chat_1`.
5. **Malicious Call Hijack**: Non-involved user tries to modify the `offer` or `answer` state of an active WebRTC session `/calls/active_call_1`.
6. **Time Spoofing (Future Messaging)**: Attacker attempts to create a message with a timestamp 10 years in the future to keep it pinned at the top.
7. **Junk ID Poisoning**: Attacker tries to create a chat room with document ID of length 20,000 characters to bloat storage.
8. **Malicious Friendship Spoofing**: User A claims to accept friendship from User B without B's consent by editing someone else's friendship doc.
9. **No-limit Array Escalation**: Inside chats, attempt to push custom array participants exceeding system bounds.
10. **Unauthorized Chat Discovery**: User attempts a list command on `/chats` representing a blanket query with no participant constraint.
11. **Call Signaling Eavesdropping**: Third-party registers onto `/calls/active_call_1/candidates` to capture peer streaming lines.
12. **Double End State Re-write**: User tries to transition an already `"ended"` call status back to `"accepted"` or `"ringing"`.

---

## 3. Threat-Vector Matrix & Expected Rules Behavior

| Threat Vector | Mitigating Helper Code / Security Rule | Expected Outcome |
|---|---|---|
| Spoofed User Profile | Match `request.auth.uid == userId` | `PERMISSION_DENIED` |
| Spoofed Messages senderId | `incoming().senderId == request.auth.uid` | `PERMISSION_DENIED` |
| Unauthorized Chat Get / List | Fetch parent chat membership via `get()` in rules | `PERMISSION_DENIED` |
| Call Hijack | Check `existing().callerId == request.auth.uid` or `existing().receiverId == request.auth.uid` in calls rules | `PERMISSION_DENIED` |
| Future timestamp spoof | `incoming().timestamp == request.time` or `incoming().createdAt == request.time` | `PERMISSION_DENIED` |
