import fetch from 'node-fetch';
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();


const SECRET = process.env.PAGE_ACCESS_TOKEN;
const endpoint = '/me/posts?fields=permalink_url%2Cfull_picture%2Cstory%2Ccreated_time%2Cmessage%2Cis_published%2Cparent_id%2Cis_hidden%2Cstatus_type';
const FBURL = 'https://graph.facebook.com/v15.0'
function FBFetch(endpoint) {
    return fetch(`${FBURL}${endpoint}&access_token=${SECRET}`);
}

const posts = [];
const updateThreshold = 10 * 1000; // 10s
let lastUpdateTimestamp = 0;

async function updateCache() {
    const response = await FBFetch(endpoint);
    const postsRawData = await response.json();

    if (!postsRawData.data) {
        console.error('couldn\'t fetch posts data');
        return;
    }

    for (const rawPost of postsRawData.data) {
        if (!rawPost.is_published || rawPost.is_hidden)
            continue;

        const post = {};
        post.id = rawPost.id;
        post.permalink_url = rawPost.permalink_url;

        if (rawPost.status_type == 'mobile_status_update')
            post.type = 'normal';
        if (rawPost.status_type == 'added_photos')
            post.type = 'photo'; /// ????
        if (rawPost.status_type == 'added_video')
            post.type = 'video';
        if (rawPost.status_type == 'created_event')
            post.type = 'event';
        
        if (rawPost.parent_id) {
            post.shared = true;
            post.orignal_url = `https://facebook.com/${rawPost.parent_id}`;
        } else {
            post.shared = false;
        }

        if (rawPost.full_picture)
            post.picture_url = rawPost.full_picture;
        
        post.timestamp = new Date(rawPost.created_time).getTime();

        if (rawPost.story)
            post.text = rawPost.story;
        if (rawPost.message)
            post.text = rawPost.message;
        
        posts.push(post);
    }
}

async function getPost(timestamp) {
    // if data is stale, update it
    if (Date.now() - lastUpdateTimestamp >= updateThreshold) {
        await updateCache();
        lastUpdateTimestamp = Date.now();
    }
    // find latest post but not newer than the provided timestamp
    // posts must be stored in chorological order, newest at [0]
    for (const post of posts) {
        if (post.timestamp < timestamp)
            return post;
    }
    // if no such post is find, return undefined
}

const app = express();

// basic homepage
app.get('/', (req, res) => {
    res.send('<h1>general kenobi</h1>');
});

// return latest post but not newer than provided timestamp
app.get('/:timestamp', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*'); // for cross site fetches
    const post = await getPost(req.params.timestamp) ?? { message : 'post not found'};
    res.json(post);
});

// https://stackoverflow.com/questions/11744975/enabling-https-on-express-js
const privateKey  = fs.readFileSync('hosting/private.key', 'utf8');
const certificate = fs.readFileSync('hosting/certificate.crt', 'utf8');
const credentials = {key: privateKey, cert: certificate};

const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

httpServer.listen(80, _ => {
    console.log('listening for http on port 80');
});
httpsServer.listen(443, _ => {
    console.log('listening for https on port 443');
});
