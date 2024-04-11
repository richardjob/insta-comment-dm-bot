const {
  IgApiClient,
  IgLoginTwoFactorRequiredError,
} = require("instagram-private-api");
const bodyParser = require("body-parser");
const express = require("express");
const Bluebird = require("bluebird");
const readline = require("node:readline");
const ig = new IgApiClient();

const app = express();
app.use(bodyParser.json());

// FB Verification TOKEN
const token = process.env.TOKEN || "token";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

(async () => {
  ig.state.generateDevice(process.env.IG_USERNAME);

  Bluebird.try(() => {
    console.log(`Logging in to: ${process.env.IG_USERNAME}`);
    ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
  })
    .catch(IgLoginTwoFactorRequiredError, async (err) => {
      const { username, totp_two_factor_on, two_factor_identifier } =
        err.response.body.two_factor_info;

      const verificationMethod = totp_two_factor_on ? "0" : "1"; // default to 1 for SMS

      ig.account.twoFactorLogin({
        username,
        verificationCode: process.env.MFA_CODE,
        twoFactorIdentifier: two_factor_identifier,
        verificationMethod, // '1' = SMS (default), '0' = TOTP (google auth for example)
        trustThisDevice: "1", // Can be omitted as '1' is used by default
      });
    })
    .catch((e) =>
      console.error(
        "An error occurred while processing two factor auth",
        e,
        e.stack
      )
    );
})();

app.get("/test", (req, res) => {
  res.send("Working");
});

// FB Verfication
app.get("/", (req, res) => {
  if (
    req.query["hub.mode"] == "subscribe" &&
    req.query["hub.verify_token"] == token
  ) {
    res.send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(400);
  }
});

// Comment DM
app.post("/", async (req, res) => {
  const username = req.body.entry[0].changes[0].value.from.username;
  const comment = req.body.entry[0].changes[0].text;

  const followersFeed = ig.feed.accountFollowers(ig.state.cookieUserId);
  const followers = await getAllItemsFromFeed(followersFeed);

  if (followers.find((object) => object.username === username)) {
    const userId = await ig.user.getIdByUsername(username);
    const thread = ig.entity.directThread([userId.toString()]);

    //Send Mesage
    let message = "";

    if (comment.toLowerCase().includes("voucher")) {
      message = "Google.com";
    } else if (comment.toLowerCase().includes("redeem code")) {
      message = "Code.com";
    }

    await thread.broadcastText("message");
    console.log(`Message Sent to ${username}`);
  } else {
    console.log(`${username} is Not a Follower`);
  }
  res.sendStatus(200);
});

async function getAllItemsFromFeed(feed) {
  let items = [];
  do {
    items = items.concat(await feed.items());
  } while (feed.isMoreAvailable());
  return items;
}

module.exports = app;