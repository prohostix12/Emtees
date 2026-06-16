import { SignJWT } from "jose";

export async function generateJitsiToken(params: {
  room: string;
  userName: string;
  userEmail?: string;
  userId: string;
  isModerator: boolean;
  appId: string;
  appSecret: string;
}) {
  const secret = new TextEncoder().encode(params.appSecret);
  return new SignJWT({
    aud: "jitsi",
    iss: params.appId,
    sub: params.appId,
    room: params.room,
    context: {
      user: {
        name: params.userName,
        email: params.userEmail || "",
        id: params.userId,
        lobby_bypass: params.isModerator,
      },
      features: {
        livestreaming: params.isModerator,
        recording: params.isModerator,
        transcription: params.isModerator,
        "outbound-call": params.isModerator,
      },
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
}
