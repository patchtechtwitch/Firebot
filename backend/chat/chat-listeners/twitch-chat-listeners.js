"use strict";

const frontendCommunicator = require("../../common/frontend-communicator");
const commandHandler = require("../commands/commandHandler");
const chatHelpers = require("../chat-helpers");
const activeUserHandler = require("./active-user-handler");
const accountAccess = require("../../common/account-access");
const chatModerationManager = require("../moderation/chat-moderation-manager");

const events = require("events");

exports.events = new events.EventEmitter();

/** @arg {import('twitch-chat-client/lib/ChatClient').default} botChatClient */
exports.setupBotChatListeners = (botChatClient) => {
    botChatClient.onWhisper(async (_user, messageText, msg) => {
        const firebotChatMessage = await chatHelpers.buildFirebotChatMessage(msg, messageText, true);
        commandHandler.handleChatMessage(firebotChatMessage);
    });
};

const HIGHLIGHT_MESSAGE_REWARD_ID = "highlight-message";

/** @arg {import('twitch-chat-client/lib/ChatClient').ChatClient} streamerChatClient */
exports.setupChatListeners = (streamerChatClient) => {
    streamerChatClient.onPrivmsg(async (_channel, user, messageText, msg) => {
        const firebotChatMessage = await chatHelpers.buildFirebotChatMessage(msg, messageText);

        chatModerationManager.moderateMessage(firebotChatMessage);

        // send to the frontend
        if (firebotChatMessage.isHighlighted) {
            firebotChatMessage.customRewardId = HIGHLIGHT_MESSAGE_REWARD_ID;
            frontendCommunicator.send("twitch:chat:rewardredemption", {
                id: HIGHLIGHT_MESSAGE_REWARD_ID,
                messageText: firebotChatMessage.rawText,
                user: {
                    id: firebotChatMessage.userId,
                    username: firebotChatMessage.username
                },
                reward: {
                    id: HIGHLIGHT_MESSAGE_REWARD_ID,
                    name: "Highlight Message",
                    cost: 0,
                    imageUrl: "https://static-cdn.jtvnw.net/automatic-reward-images/highlight-4.png"
                }
            });
        }
        frontendCommunicator.send("twitch:chat:message", firebotChatMessage);
        exports.events.emit("chat-message", firebotChatMessage);

        commandHandler.handleChatMessage(firebotChatMessage);

        activeUserHandler.addActiveUser(msg.userInfo, true);

        const viewerArrivedListener = require("../../events/twitch-events/viewer-arrived");
        viewerArrivedListener.triggerViewerArrived(msg.userInfo.displayName);

        if (msg.isCheer) {
            const cheerListener = require("../../events/twitch-events/cheer");
            cheerListener.triggerCheer(msg.userInfo.displayName, msg.totalBits, msg.params.message);
        }

        const { streamer, bot } = accountAccess.getAccounts();
        if (user !== streamer.username && user !== bot.username) {
            const timerManager = require("../../timers/timer-manager");
            timerManager.incrementChatLineCounters();
        }

        const chatMessageListener = require("../../events/twitch-events/chat-message");
        chatMessageListener.triggerChatMessage(firebotChatMessage);
    });

    streamerChatClient.onWhisper(async (_user, messageText, msg) => {
        const firebotChatMessage = await chatHelpers.buildFirebotChatMessage(msg, messageText, true);

        commandHandler.handleChatMessage(firebotChatMessage);

        frontendCommunicator.send("twitch:chat:message", firebotChatMessage);
    });

    streamerChatClient.onAction(async (_channel, _user, messageText, msg) => {
        const firebotChatMessage = await chatHelpers.buildFirebotChatMessage(msg, messageText, false, true);
        frontendCommunicator.send("twitch:chat:message", firebotChatMessage);

        const chatMessageListener = require("../../events/twitch-events/chat-message");
        chatMessageListener.triggerChatMessage(firebotChatMessage);

        const viewerArrivedListener = require("../../events/twitch-events/viewer-arrived");
        viewerArrivedListener.triggerViewerArrived(msg.userInfo.displayName);
    });

    streamerChatClient.onHosted((_, byChannel, auto, viewers) => {
        const hostListener = require("../../events/twitch-events/host");
        hostListener.triggerHost(byChannel, auto, viewers);
    });

    streamerChatClient.onSub((_channel, _user, subInfo, msg) => {
        const subListener = require("../../events/twitch-events/sub");
        subListener.triggerSub(subInfo.displayName, subInfo.plan, subInfo.planName, subInfo.months,
            subInfo.streak, subInfo.isPrime);
    });

    streamerChatClient.onResub((_channel, _username, subInfo) => {
        const subListener = require("../../events/twitch-events/sub");
        subListener.triggerSub(subInfo.displayName, subInfo.plan, subInfo.planName, subInfo.months,
            subInfo.streak, subInfo.isPrime, true);
    });

    streamerChatClient.onSubGift((_channel, _user, giftSubInfo, msg) => {
        const giftSubListener = require("../../events/twitch-events/gift-sub");
        giftSubListener.triggerSubGift(giftSubInfo.gifterDisplayName,
            giftSubInfo.displayName, giftSubInfo.plan, giftSubInfo.planName,
            giftSubInfo.giftDuration);
    });

    streamerChatClient.onCommunitySub((_channel, _user, subInfo, msg) => {
        const giftSubListener = require("../../events/twitch-events/gift-sub");
        giftSubListener.triggerCommunitySubGift(subInfo.gifterDisplayName,
            subInfo.plan, subInfo.count);
    });

    streamerChatClient.onRaid((_channel, _username, raidInfo) => {
        const raidListener = require("../../events/twitch-events/raid");
        raidListener.triggerRaid(raidInfo.displayName, raidInfo.viewerCount);
    });

    streamerChatClient.onBan((_, username) => {
        const bannedListener = require("../../events/twitch-events/viewer-banned");
        bannedListener.triggerBanned(username);
    });

    streamerChatClient.onTimeout((_, username, duration) => {
        const timeoutListener = require("../../events/twitch-events/viewer-timeout");
        timeoutListener.triggerTimeout(username, duration);
    });
};