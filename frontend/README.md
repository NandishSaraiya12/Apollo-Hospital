# Apollo Recording Template

VideoSDK [custom recording template](https://docs.videosdk.live/react/guide/video-and-audio-calling-api-sdk/recording/custom-template)
for the doctor–patient consultation. It shows the doctor and patient side by side,
plus a banner whenever either of them has an unstable connection.

## Setup

```bash
npm install
npm start      # http://localhost:3000/?meetingId=…&token=…
npm run build  # deploy the build/ folder
```

## Usage

Pass the deployed URL as `templateUrl` to the
[Start Recording API](https://docs.videosdk.live/api-reference/realtime-communication/start-recording):

```json
{ "roomId": "<meetingId>", "templateUrl": "https://<host>/?meetingId=<meetingId>&token=<token>" }
```

VideoSDK appends `participantId` itself; the template joins with it as `recorder`
so it stays hidden from the doctor and patient.
