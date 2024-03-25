# Welcome to Orange Meets

## Variables

Go to the [Cloudflare Calls dashboard](https://dash.cloudflare.com/?to=/:account/calls) and create an application.

Put these variables into `.dev.vars`

```
CALLS_APP_ID=<APP_ID_GOES_HERE>
CALLS_APP_SECRET=<SECRET_GOES_HERE>
```

## Development

```sh
npm run dev
```

Open up [http://127.0.0.1:8787](http://127.0.0.1:8787) and you should be ready to go!

## Deployment

First you will need to create the feedback queue:

```sh
wrangler queues create orange-meets-feedback-queue
```

Then you can run

```sh
npm run deploy
```

You will also need to set the token as a secret by running:

```sh
wrangler secret put CALLS_APP_SECRET
```
