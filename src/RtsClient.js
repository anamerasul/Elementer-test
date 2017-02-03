import 'whatwg-fetch';

function checkStatus(response) {
    if (!response.ok) {
        return response.text().then((text) => {
            throw new Error(text);
        });
    }
    return response;
}

function parseJson(response) {
    return response.json();
}

function encodeQueryParams(params) {
    return '?' + Object.keys(params).map((k) => {
        return k + '=' + encodeURIComponent(params[k]);
    }).join('&');
}

const request = (url, opts) => {
    if (opts && opts.qs) {
        url += encodeQueryParams(opts.qs);
        delete opts.qs;
    }
    if (opts && opts.body) {
        if (!opts.headers) {
            opts.headers = {};
        }
        opts.body = JSON.stringify(opts.body);
        opts.headers['Content-Type'] = 'application/json';
    }
    return fetch(url, opts)
        .then(checkStatus)
        .then(parseJson);
};


export default class RtsClient {
    constructor(url) {
        this._url = url;
    }

    getTeamsConfig() {
        return request(this._url + '/teams');
    }

    /**
     * Track a referral with the Riot Team Server. This should be called once a referred
     * user has been successfully registered.
     * @param {string} referrer the user ID of one who referred the user to Riot.
     * @param {string} userId the user ID of the user being referred.
     * @param {string} userEmail the email address linked to `userId`.
     * @returns {Promise} a promise that resolves to { team_token: 'sometoken' } upon
     * success.
     */
    trackReferral(referrer, userId, userEmail) {
        return request(this._url + '/register',
            {
                body: {
                    referrer: referrer,
                    user_id: userId,
                    user_email: userEmail,
                },
                method: 'POST',
            }
        );
    }

    getTeam(teamToken) {
        return request(this._url + '/teamConfiguration',
            {
                qs: {
                    team_token: teamToken,
                },
            }
        );
    }

    login(userId) {
        return request(this._url + '/login',
            {
                qs: {
                    user_id: userId,
                },
            }
        );
    }
}
