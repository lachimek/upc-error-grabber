import axios, { AxiosInstance } from "axios";
import querystring from "querystring";
import tough from "tough-cookie";
import xml2js from "xml2js";

export type ErrorHistoryRecord = {
    prior: string;
    text: string;
    time: string;
    t: string;
};

export class ConnectBoxClient {
    baseUrl = "http://192.168.0.1";
    cookieJar = new tough.CookieJar();
    client: AxiosInstance;
    currSessionToken: string | null;
    pendingSessionTokenPromiseResolvers: any[] = [];

    constructor() {
        this.client = axios.create({ baseURL: this.baseUrl });
        this.client.interceptors.request.use((req) => {
            req.headers!["Cookie"] = this.cookieJar.getCookieStringSync(this.baseUrl);
            return req;
        });

        this.client.interceptors.response.use((res) => {
            let cookies: any[];
            if (Array.isArray(res.headers["set-cookie"])) {
                cookies = res.headers["set-cookie"].map((cookieString) => tough.Cookie.parse(cookieString));
            } else {
                cookies = [tough.Cookie.parse(res.headers["set-cookie"] as unknown as string)];
            }
            cookies.forEach((cookie) => {
                // If the request was redirected, the redirect URL can be found in res.request.res.responseUrl
                this.cookieJar.setCookieSync(cookie, res.request.res.responseUrl || res.config.url);
                if (cookie.key === "sessionToken") {
                    this.currSessionToken = cookie.value;
                    this.giveNextSessionToken();
                }
            });
            return res;
        });
        this.currSessionToken = "";
    }

    getSessionToken() {
        if (this.currSessionToken) {
            const currSessionToken = this.currSessionToken;
            this.currSessionToken = null;
            return Promise.resolve(currSessionToken);
        } else {
            let resolve = null;
            let sessionTokenPromise = new Promise((r: any) => (resolve = r));
            this.pendingSessionTokenPromiseResolvers.push(resolve);
            return sessionTokenPromise;
        }
    }

    giveNextSessionToken() {
        if (this.currSessionToken && this.pendingSessionTokenPromiseResolvers.length > 0) {
            const currSessionToken = this.currSessionToken;
            this.currSessionToken = null;
            this.pendingSessionTokenPromiseResolvers.shift()(currSessionToken);
        }
    }

    call(endpoint: string, fun: number, data: {}) {
        return this.getSessionToken().then((sessionToken) => {
            // careful: order does matter here:
            data = {
                token: sessionToken,
                fun,
                ...data,
            };

            return this.client.post(endpoint, new URLSearchParams(data).toString(), { maxRedirects: 0 });
        });
    }

    callGetter(fun: number, data: {}) {
        return this.call("/xml/getter.xml", fun, data);
    }

    callSetter(fun: number, data: {}) {
        return this.call("/xml/setter.xml", fun, data);
    }

    login(password: string) {
        // first make request to / to get first session token, then login
        return this.client.get("/").then(() => this.callSetter(15, { Username: "NULL", Password: password }));
    }

    logout() {
        this.cookieJar = new tough.CookieJar();
        return this.callSetter(16, {});
    }

    getErrorHistory() {
        return this.callGetter(13, {}).then(
            (res) =>
                new Promise<ErrorHistoryRecord[]>((resolve, reject) => {
                    xml2js.parseString(res.data, (err, obj) => {
                        resolve(
                            obj.eventlog_table.eventlog.map((event: any) => {
                                return {
                                    prior: event.prior[0],
                                    text: event.text[0],
                                    time: event.time[0],
                                    t: event.t[0],
                                };
                            })
                        );
                    });
                })
        );
    }
}
