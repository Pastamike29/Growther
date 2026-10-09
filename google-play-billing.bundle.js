(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // node_modules/@capacitor/core/dist/index.js
  var ExceptionCode, CapacitorException, getPlatformId, createCapacitor, initCapacitorGlobal, Capacitor, registerPlugin, WebPlugin, encode, decode, CapacitorCookiesPluginWeb, CapacitorCookies, readBlobAsBase64, normalizeHttpHeaders, buildUrlParams, buildRequestInit, CapacitorHttpPluginWeb, CapacitorHttp, SystemBarsStyle, SystemBarType, SystemBarsPluginWeb, SystemBars;
  var init_dist = __esm({
    "node_modules/@capacitor/core/dist/index.js"() {
      (function(ExceptionCode2) {
        ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
        ExceptionCode2["Unavailable"] = "UNAVAILABLE";
      })(ExceptionCode || (ExceptionCode = {}));
      CapacitorException = class extends Error {
        constructor(message, code, data) {
          super(message);
          this.message = message;
          this.code = code;
          this.data = data;
        }
      };
      getPlatformId = (win) => {
        var _a, _b;
        if (win === null || win === void 0 ? void 0 : win.androidBridge) {
          return "android";
        } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
          return "ios";
        } else {
          return "web";
        }
      };
      createCapacitor = (win) => {
        const capCustomPlatform = win.CapacitorCustomPlatform || null;
        const cap = win.Capacitor || {};
        const Plugins = cap.Plugins = cap.Plugins || {};
        const getPlatform = () => {
          return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
        };
        const isNativePlatform = () => getPlatform() !== "web";
        const isPluginAvailable = (pluginName) => {
          const plugin = registeredPlugins.get(pluginName);
          if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
            return true;
          }
          if (getPluginHeader(pluginName)) {
            return true;
          }
          return false;
        };
        const getPluginHeader = (pluginName) => {
          var _a;
          return (_a = cap.PluginHeaders) === null || _a === void 0 ? void 0 : _a.find((h) => h.name === pluginName);
        };
        const handleError = (err) => win.console.error(err);
        const registeredPlugins = /* @__PURE__ */ new Map();
        const registerPlugin2 = (pluginName, jsImplementations = {}) => {
          const registeredPlugin = registeredPlugins.get(pluginName);
          if (registeredPlugin) {
            console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
            return registeredPlugin.proxy;
          }
          const platform = getPlatform();
          const pluginHeader = getPluginHeader(pluginName);
          let jsImplementation;
          const loadPluginImplementation = async () => {
            if (!jsImplementation && platform in jsImplementations) {
              jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
            } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
              jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
            }
            return jsImplementation;
          };
          const createPluginMethod = (impl, prop) => {
            var _a, _b;
            if (pluginHeader) {
              const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
              if (methodHeader) {
                if (methodHeader.rtype === "promise") {
                  return (options) => cap.nativePromise(pluginName, prop.toString(), options);
                } else {
                  return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
                }
              } else if (impl) {
                return (_a = impl[prop]) === null || _a === void 0 ? void 0 : _a.bind(impl);
              }
            } else if (impl) {
              return (_b = impl[prop]) === null || _b === void 0 ? void 0 : _b.bind(impl);
            } else {
              throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
            }
          };
          const createPluginMethodWrapper = (prop) => {
            let remove;
            const wrapper = (...args) => {
              const p = loadPluginImplementation().then((impl) => {
                const fn = createPluginMethod(impl, prop);
                if (fn) {
                  const p2 = fn(...args);
                  remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                  return p2;
                } else {
                  throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
                }
              });
              if (prop === "addListener") {
                p.remove = async () => remove();
              }
              return p;
            };
            wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
            Object.defineProperty(wrapper, "name", {
              value: prop,
              writable: false,
              configurable: false
            });
            return wrapper;
          };
          const addListener = createPluginMethodWrapper("addListener");
          const removeListener = createPluginMethodWrapper("removeListener");
          const addListenerNative = (eventName, callback) => {
            const call = addListener({ eventName }, callback);
            const remove = async () => {
              const callbackId = await call;
              removeListener({
                eventName,
                callbackId
              }, callback);
            };
            const p = new Promise((resolve) => call.then(() => resolve({ remove })));
            p.remove = async () => {
              console.warn(`Using addListener() without 'await' is deprecated.`);
              await remove();
            };
            return p;
          };
          const proxy = new Proxy({}, {
            get(_, prop) {
              switch (prop) {
                // https://github.com/facebook/react/issues/20030
                case "$$typeof":
                  return void 0;
                case "toJSON":
                  return () => ({});
                case "addListener":
                  return pluginHeader ? addListenerNative : addListener;
                case "removeListener":
                  return removeListener;
                default:
                  return createPluginMethodWrapper(prop);
              }
            }
          });
          Plugins[pluginName] = proxy;
          registeredPlugins.set(pluginName, {
            name: pluginName,
            proxy,
            platforms: /* @__PURE__ */ new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
          });
          return proxy;
        };
        if (!cap.convertFileSrc) {
          cap.convertFileSrc = (filePath) => filePath;
        }
        cap.getPlatform = getPlatform;
        cap.handleError = handleError;
        cap.isNativePlatform = isNativePlatform;
        cap.isPluginAvailable = isPluginAvailable;
        cap.registerPlugin = registerPlugin2;
        cap.Exception = CapacitorException;
        cap.DEBUG = !!cap.DEBUG;
        cap.isLoggingEnabled = !!cap.isLoggingEnabled;
        return cap;
      };
      initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
      Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
      registerPlugin = Capacitor.registerPlugin;
      WebPlugin = class {
        constructor() {
          this.listeners = {};
          this.retainedEventArguments = {};
          this.windowListeners = {};
        }
        addListener(eventName, listenerFunc) {
          let firstListener = false;
          const listeners = this.listeners[eventName];
          if (!listeners) {
            this.listeners[eventName] = [];
            firstListener = true;
          }
          this.listeners[eventName].push(listenerFunc);
          const windowListener = this.windowListeners[eventName];
          if (windowListener && !windowListener.registered) {
            this.addWindowListener(windowListener);
          }
          if (firstListener) {
            this.sendRetainedArgumentsForEvent(eventName);
          }
          const remove = async () => this.removeListener(eventName, listenerFunc);
          const p = Promise.resolve({ remove });
          return p;
        }
        async removeAllListeners() {
          this.listeners = {};
          for (const listener in this.windowListeners) {
            this.removeWindowListener(this.windowListeners[listener]);
          }
          this.windowListeners = {};
        }
        notifyListeners(eventName, data, retainUntilConsumed) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            if (retainUntilConsumed) {
              let args = this.retainedEventArguments[eventName];
              if (!args) {
                args = [];
              }
              args.push(data);
              this.retainedEventArguments[eventName] = args;
            }
            return;
          }
          listeners.forEach((listener) => listener(data));
        }
        hasListeners(eventName) {
          var _a;
          return !!((_a = this.listeners[eventName]) === null || _a === void 0 ? void 0 : _a.length);
        }
        registerWindowListener(windowEventName, pluginEventName) {
          this.windowListeners[pluginEventName] = {
            registered: false,
            windowEventName,
            pluginEventName,
            handler: (event) => {
              this.notifyListeners(pluginEventName, event);
            }
          };
        }
        unimplemented(msg = "not implemented") {
          return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
        }
        unavailable(msg = "not available") {
          return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
        }
        async removeListener(eventName, listenerFunc) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            return;
          }
          const index = listeners.indexOf(listenerFunc);
          if (index !== -1) {
            this.listeners[eventName].splice(index, 1);
          }
          if (!this.listeners[eventName].length) {
            this.removeWindowListener(this.windowListeners[eventName]);
          }
        }
        addWindowListener(handle) {
          window.addEventListener(handle.windowEventName, handle.handler);
          handle.registered = true;
        }
        removeWindowListener(handle) {
          if (!handle) {
            return;
          }
          window.removeEventListener(handle.windowEventName, handle.handler);
          handle.registered = false;
        }
        sendRetainedArgumentsForEvent(eventName) {
          const args = this.retainedEventArguments[eventName];
          if (!args) {
            return;
          }
          delete this.retainedEventArguments[eventName];
          args.forEach((arg) => {
            this.notifyListeners(eventName, arg);
          });
        }
      };
      encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
      decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
      CapacitorCookiesPluginWeb = class extends WebPlugin {
        async getCookies() {
          const cookies = document.cookie;
          const cookieMap = {};
          cookies.split(";").forEach((cookie) => {
            if (cookie.length <= 0)
              return;
            let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
            key = decode(key).trim();
            value = decode(value).trim();
            cookieMap[key] = value;
          });
          return cookieMap;
        }
        async setCookie(options) {
          try {
            const encodedKey = encode(options.key);
            const encodedValue = encode(options.value);
            const expires = options.expires ? `; expires=${options.expires.replace("expires=", "")}` : "";
            const path = (options.path || "/").replace("path=", "");
            const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
            document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async deleteCookie(options) {
          try {
            document.cookie = `${options.key}=; Max-Age=0`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearCookies() {
          try {
            const cookies = document.cookie.split(";") || [];
            for (const cookie of cookies) {
              document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
            }
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearAllCookies() {
          try {
            await this.clearCookies();
          } catch (error) {
            return Promise.reject(error);
          }
        }
      };
      CapacitorCookies = registerPlugin("CapacitorCookies", {
        web: () => new CapacitorCookiesPluginWeb()
      });
      readBlobAsBase64 = async (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result;
          resolve(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
      });
      normalizeHttpHeaders = (headers = {}) => {
        const originalKeys = Object.keys(headers);
        const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
        const normalized = loweredKeys.reduce((acc, key, index) => {
          acc[key] = headers[originalKeys[index]];
          return acc;
        }, {});
        return normalized;
      };
      buildUrlParams = (params, shouldEncode = true) => {
        if (!params)
          return null;
        const output = Object.entries(params).reduce((accumulator, entry) => {
          const [key, value] = entry;
          let encodedValue;
          let item;
          if (Array.isArray(value)) {
            item = "";
            value.forEach((str) => {
              encodedValue = shouldEncode ? encodeURIComponent(str) : str;
              item += `${key}=${encodedValue}&`;
            });
            item.slice(0, -1);
          } else {
            encodedValue = shouldEncode ? encodeURIComponent(value) : value;
            item = `${key}=${encodedValue}`;
          }
          return `${accumulator}&${item}`;
        }, "");
        return output.substr(1);
      };
      buildRequestInit = (options, extra = {}) => {
        const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
        const headers = normalizeHttpHeaders(options.headers);
        const type = headers["content-type"] || "";
        if (typeof options.data === "string") {
          output.body = options.data;
        } else if (type.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(options.data || {})) {
            params.set(key, value);
          }
          output.body = params.toString();
        } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
          const form = new FormData();
          if (options.data instanceof FormData) {
            options.data.forEach((value, key) => {
              form.append(key, value);
            });
          } else {
            for (const key of Object.keys(options.data)) {
              form.append(key, options.data[key]);
            }
          }
          output.body = form;
          const headers2 = new Headers(output.headers);
          headers2.delete("content-type");
          output.headers = headers2;
        } else if (type.includes("application/json") || typeof options.data === "object") {
          output.body = JSON.stringify(options.data);
        }
        return output;
      };
      CapacitorHttpPluginWeb = class extends WebPlugin {
        /**
         * Perform an Http request given a set of options
         * @param options Options to build the HTTP request
         */
        async request(options) {
          const requestInit = buildRequestInit(options, options.webFetchExtra);
          const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
          const url = urlParams ? `${options.url}?${urlParams}` : options.url;
          const response = await fetch(url, requestInit);
          const contentType = response.headers.get("content-type") || "";
          let { responseType = "text" } = response.ok ? options : {};
          if (contentType.includes("application/json")) {
            responseType = "json";
          }
          let data;
          let blob;
          switch (responseType) {
            case "arraybuffer":
            case "blob":
              blob = await response.blob();
              data = await readBlobAsBase64(blob);
              break;
            case "json":
              data = await response.json();
              break;
            case "document":
            case "text":
            default:
              data = await response.text();
          }
          const headers = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            data,
            headers,
            status: response.status,
            url: response.url
          };
        }
        /**
         * Perform an Http GET request given a set of options
         * @param options Options to build the HTTP request
         */
        async get(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
        }
        /**
         * Perform an Http POST request given a set of options
         * @param options Options to build the HTTP request
         */
        async post(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
        }
        /**
         * Perform an Http PUT request given a set of options
         * @param options Options to build the HTTP request
         */
        async put(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
        }
        /**
         * Perform an Http PATCH request given a set of options
         * @param options Options to build the HTTP request
         */
        async patch(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
        }
        /**
         * Perform an Http DELETE request given a set of options
         * @param options Options to build the HTTP request
         */
        async delete(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
        }
      };
      CapacitorHttp = registerPlugin("CapacitorHttp", {
        web: () => new CapacitorHttpPluginWeb()
      });
      (function(SystemBarsStyle2) {
        SystemBarsStyle2["Dark"] = "DARK";
        SystemBarsStyle2["Light"] = "LIGHT";
        SystemBarsStyle2["Default"] = "DEFAULT";
      })(SystemBarsStyle || (SystemBarsStyle = {}));
      (function(SystemBarType2) {
        SystemBarType2["StatusBar"] = "StatusBar";
        SystemBarType2["NavigationBar"] = "NavigationBar";
      })(SystemBarType || (SystemBarType = {}));
      SystemBarsPluginWeb = class extends WebPlugin {
        async setStyle() {
          this.unavailable("not available for web");
        }
        async setAnimation() {
          this.unavailable("not available for web");
        }
        async show() {
          this.unavailable("not available for web");
        }
        async hide() {
          this.unavailable("not available for web");
        }
      };
      SystemBars = registerPlugin("SystemBars", {
        web: () => new SystemBarsPluginWeb()
      });
    }
  });

  // node_modules/@capgo/native-purchases/dist/esm/web.js
  var web_exports = {};
  __export(web_exports, {
    NativePurchasesWeb: () => NativePurchasesWeb
  });
  var NativePurchasesWeb;
  var init_web = __esm({
    "node_modules/@capgo/native-purchases/dist/esm/web.js"() {
      init_dist();
      NativePurchasesWeb = class extends WebPlugin {
        async configure(options) {
          void options;
        }
        async getUnfinishedTransactions() {
          console.error("getUnfinishedTransactions only mocked in web");
          return { transactions: [] };
        }
        async finishTransaction(options) {
          void options;
          console.error("finishTransaction only mocked in web");
        }
        async restorePurchases() {
          console.error("restorePurchases only mocked in web");
        }
        async getProducts(options) {
          console.error("getProducts only mocked in web " + options);
          return { products: [] };
        }
        async getProduct(options) {
          console.error("getProduct only mocked in web " + options);
          return { product: {} };
        }
        async purchaseProduct(options) {
          console.error("purchaseProduct only mocked in web" + options);
          return { transactionId: "transactionId" };
        }
        async isBillingSupported() {
          console.error("isBillingSupported only mocked in web");
          return { isBillingSupported: false };
        }
        async getPluginVersion() {
          console.warn("Cannot get plugin version in web");
          return { version: "default" };
        }
        async getPurchases(options) {
          console.error("getPurchases only mocked in web " + options);
          return { purchases: [] };
        }
        async manageSubscriptions() {
          console.error("manageSubscriptions only mocked in web");
        }
        async presentOfferCodeRedeemSheet() {
          console.error("presentOfferCodeRedeemSheet only mocked in web");
        }
        async acknowledgePurchase(options) {
          void options;
          console.error("acknowledgePurchase only mocked in web");
        }
        async consumePurchase(options) {
          void options;
          throw new Error("consumePurchase is only available on Android");
        }
        async getStorefront() {
          console.error("getStorefront only mocked in web");
          return { countryCode: "" };
        }
        async getAppTransaction() {
          console.error("getAppTransaction only mocked in web");
          return {
            appTransaction: {
              originalAppVersion: "1.0.0",
              originalPurchaseDate: (/* @__PURE__ */ new Date()).toISOString(),
              bundleId: "com.example.app",
              appVersion: "1.0.0",
              environment: null
            }
          };
        }
        async isEntitledToOldBusinessModel(options) {
          void options;
          console.error("isEntitledToOldBusinessModel only mocked in web");
          return {
            isOlderVersion: false,
            originalAppVersion: "1.0.0"
          };
        }
      };
    }
  });

  // src/google-play-billing.js
  init_dist();

  // node_modules/@capgo/native-purchases/dist/esm/index.js
  init_dist();

  // node_modules/@capgo/native-purchases/dist/esm/definitions.js
  var ATTRIBUTION_NETWORK;
  (function(ATTRIBUTION_NETWORK2) {
    ATTRIBUTION_NETWORK2[ATTRIBUTION_NETWORK2["APPLE_SEARCH_ADS"] = 0] = "APPLE_SEARCH_ADS";
    ATTRIBUTION_NETWORK2[ATTRIBUTION_NETWORK2["ADJUST"] = 1] = "ADJUST";
    ATTRIBUTION_NETWORK2[ATTRIBUTION_NETWORK2["APPSFLYER"] = 2] = "APPSFLYER";
    ATTRIBUTION_NETWORK2[ATTRIBUTION_NETWORK2["BRANCH"] = 3] = "BRANCH";
    ATTRIBUTION_NETWORK2[ATTRIBUTION_NETWORK2["TENJIN"] = 4] = "TENJIN";
    ATTRIBUTION_NETWORK2[ATTRIBUTION_NETWORK2["FACEBOOK"] = 5] = "FACEBOOK";
  })(ATTRIBUTION_NETWORK || (ATTRIBUTION_NETWORK = {}));
  var PURCHASE_TYPE;
  (function(PURCHASE_TYPE2) {
    PURCHASE_TYPE2["INAPP"] = "inapp";
    PURCHASE_TYPE2["SUBS"] = "subs";
  })(PURCHASE_TYPE || (PURCHASE_TYPE = {}));
  var BILLING_FEATURE;
  (function(BILLING_FEATURE2) {
    BILLING_FEATURE2[BILLING_FEATURE2["SUBSCRIPTIONS"] = 0] = "SUBSCRIPTIONS";
    BILLING_FEATURE2[BILLING_FEATURE2["SUBSCRIPTIONS_UPDATE"] = 1] = "SUBSCRIPTIONS_UPDATE";
    BILLING_FEATURE2[BILLING_FEATURE2["IN_APP_ITEMS_ON_VR"] = 2] = "IN_APP_ITEMS_ON_VR";
    BILLING_FEATURE2[BILLING_FEATURE2["SUBSCRIPTIONS_ON_VR"] = 3] = "SUBSCRIPTIONS_ON_VR";
    BILLING_FEATURE2[BILLING_FEATURE2["PRICE_CHANGE_CONFIRMATION"] = 4] = "PRICE_CHANGE_CONFIRMATION";
  })(BILLING_FEATURE || (BILLING_FEATURE = {}));
  var PRORATION_MODE;
  (function(PRORATION_MODE2) {
    PRORATION_MODE2[PRORATION_MODE2["UNKNOWN_SUBSCRIPTION_UPGRADE_DOWNGRADE_POLICY"] = 0] = "UNKNOWN_SUBSCRIPTION_UPGRADE_DOWNGRADE_POLICY";
    PRORATION_MODE2[PRORATION_MODE2["IMMEDIATE_WITH_TIME_PRORATION"] = 1] = "IMMEDIATE_WITH_TIME_PRORATION";
    PRORATION_MODE2[PRORATION_MODE2["IMMEDIATE_AND_CHARGE_PRORATED_PRICE"] = 2] = "IMMEDIATE_AND_CHARGE_PRORATED_PRICE";
    PRORATION_MODE2[PRORATION_MODE2["IMMEDIATE_WITHOUT_PRORATION"] = 3] = "IMMEDIATE_WITHOUT_PRORATION";
    PRORATION_MODE2[PRORATION_MODE2["DEFERRED"] = 4] = "DEFERRED";
  })(PRORATION_MODE || (PRORATION_MODE = {}));
  var PACKAGE_TYPE;
  (function(PACKAGE_TYPE2) {
    PACKAGE_TYPE2["UNKNOWN"] = "UNKNOWN";
    PACKAGE_TYPE2["CUSTOM"] = "CUSTOM";
    PACKAGE_TYPE2["LIFETIME"] = "LIFETIME";
    PACKAGE_TYPE2["ANNUAL"] = "ANNUAL";
    PACKAGE_TYPE2["SIX_MONTH"] = "SIX_MONTH";
    PACKAGE_TYPE2["THREE_MONTH"] = "THREE_MONTH";
    PACKAGE_TYPE2["TWO_MONTH"] = "TWO_MONTH";
    PACKAGE_TYPE2["MONTHLY"] = "MONTHLY";
    PACKAGE_TYPE2["WEEKLY"] = "WEEKLY";
  })(PACKAGE_TYPE || (PACKAGE_TYPE = {}));
  var INTRO_ELIGIBILITY_STATUS;
  (function(INTRO_ELIGIBILITY_STATUS2) {
    INTRO_ELIGIBILITY_STATUS2[INTRO_ELIGIBILITY_STATUS2["INTRO_ELIGIBILITY_STATUS_UNKNOWN"] = 0] = "INTRO_ELIGIBILITY_STATUS_UNKNOWN";
    INTRO_ELIGIBILITY_STATUS2[INTRO_ELIGIBILITY_STATUS2["INTRO_ELIGIBILITY_STATUS_INELIGIBLE"] = 1] = "INTRO_ELIGIBILITY_STATUS_INELIGIBLE";
    INTRO_ELIGIBILITY_STATUS2[INTRO_ELIGIBILITY_STATUS2["INTRO_ELIGIBILITY_STATUS_ELIGIBLE"] = 2] = "INTRO_ELIGIBILITY_STATUS_ELIGIBLE";
  })(INTRO_ELIGIBILITY_STATUS || (INTRO_ELIGIBILITY_STATUS = {}));

  // node_modules/@capgo/native-purchases/dist/esm/index.js
  var NativePurchases = registerPlugin("NativePurchases", {
    web: () => Promise.resolve().then(() => (init_web(), web_exports)).then((m) => new m.NativePurchasesWeb())
  });

  // src/google-play-billing.js
  var plans = {
    monthly: { productIdentifier: "growther_premium_monthly", basePlanId: "monthly" },
    annual: { productIdentifier: "growther_premium_annual", basePlanId: "annual" }
  };
  var signedInAdult = false;
  var productsByPlan = {};
  var verifiedPurchaseToken = null;
  function isAndroidApp() {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  }
  function setPremium(active) {
    window.gaPremiumSubscriptionActive = active === true;
    try {
      if (active) localStorage.setItem("ga-premium-subscription-status", "active");
      else localStorage.removeItem("ga-premium-subscription-status");
    } catch (_) {
    }
    const manage = document.querySelector("#gaPremiumOfferBackdrop [data-premium-manage]");
    if (manage) {
      manage.hidden = !active;
      const actions = manage.closest("[data-premium-actions]");
      if (actions) actions.hidden = !active;
    }
    window.dispatchEvent(new CustomEvent("growther-premium-changed", { detail: { active: active === true } }));
  }
  function errorMessage(error) {
    return error?.message || "Google Play could not complete that action. Please try again.";
  }
  async function fetchStoreProducts() {
    if (!isAndroidApp() || !signedInAdult) return;
    try {
      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      if (!isBillingSupported) throw new Error("Google Play Billing is not available on this device.");
      const { products } = await NativePurchases.getProducts({
        productIdentifiers: Object.values(plans).map((plan) => plan.productIdentifier),
        productType: PURCHASE_TYPE.SUBS
      });
      productsByPlan = {};
      for (const [planName, plan] of Object.entries(plans)) {
        const product = products.find((item) => item.planIdentifier === plan.productIdentifier && item.identifier === plan.basePlanId);
        if (product) productsByPlan[planName] = product;
      }
      renderStorePrices();
    } catch (error) {
      console.warn("Google Play product query failed:", error);
    }
  }
  function formatWeekly(product, planName) {
    const weeks = planName === "annual" ? 52 : 52 / 12;
    const weekly = product.price / weeks;
    const amount = new Intl.NumberFormat(void 0, {
      style: "currency",
      currency: product.currencyCode,
      maximumFractionDigits: 2
    }).format(weekly);
    return `\u2248 ${amount} / week`;
  }
  function renderStorePrices() {
    const monthly = productsByPlan.monthly;
    const annual = productsByPlan.annual;
    const setText = (selector, value) => {
      const node = document.querySelector(`#gaPremiumOfferBackdrop ${selector}`);
      if (node) {
        node.textContent = value;
        node.hidden = false;
      }
    };
    if (monthly) {
      setText("[data-premium-monthly-cost]", `${monthly.priceString} / month`);
      setText("[data-premium-weekly-monthly]", formatWeekly(monthly, "monthly"));
    }
    if (annual) {
      setText("[data-premium-yearly-cost]", `${annual.priceString} / year`);
      setText("[data-premium-weekly-yearly]", formatWeekly(annual, "annual"));
    }
  }
  async function verifyToken(purchaseToken) {
    if (!window.gaBillingVerifyPurchase) throw new Error("Secure purchase verification is not configured.");
    const result = await window.gaBillingVerifyPurchase(purchaseToken);
    if (!result?.active) return false;
    verifiedPurchaseToken = purchaseToken;
    setPremium(true);
    return true;
  }
  async function refreshSubscription() {
    if (!isAndroidApp() || !signedInAdult) {
      setPremium(false);
      verifiedPurchaseToken = null;
      return null;
    }
    try {
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
      for (const purchase of purchases || []) {
        if (purchase.purchaseState !== "1" || !purchase.purchaseToken) continue;
        if (await verifyToken(purchase.purchaseToken)) return purchase.purchaseToken;
      }
    } catch (error) {
      console.warn("Subscription status could not be refreshed:", error);
    }
    verifiedPurchaseToken = null;
    setPremium(false);
    return null;
  }
  async function activePurchaseToken() {
    if (!isAndroidApp() || !signedInAdult) return null;
    if (verifiedPurchaseToken) return verifiedPurchaseToken;
    return await refreshSubscription();
  }
  async function choosePlan(planName) {
    if (!isAndroidApp()) {
      window.alert("Google Play subscriptions are available in the Android app.");
      return;
    }
    if (!signedInAdult) {
      window.alert("Sign in with your adult account before subscribing.");
      return;
    }
    const plan = plans[planName];
    const product = productsByPlan[planName];
    if (!plan || !product) {
      window.alert("This plan is not available yet. Create and activate its Google Play subscription and base plan first.");
      return;
    }
    try {
      const purchase = await NativePurchases.purchaseProduct({
        productIdentifier: plan.productIdentifier,
        planIdentifier: plan.basePlanId,
        offerToken: product.offerToken,
        productType: PURCHASE_TYPE.SUBS,
        autoAcknowledgePurchases: false
      });
      if (purchase.purchaseState !== "1" || !purchase.purchaseToken) {
        window.alert("Google Play has not completed the payment yet. Premium access will start after payment completes.");
        return;
      }
      if (await verifyToken(purchase.purchaseToken)) window.alert("Growther Premium is active.");
      else window.alert("Google Play has not confirmed an active Premium subscription yet.");
    } catch (error) {
      if (error?.userCancelled || /cancel/i.test(error?.message || "")) return;
      window.alert(errorMessage(error));
    }
  }
  async function restorePurchases() {
    if (!isAndroidApp() || !signedInAdult) {
      window.alert("Sign in to your adult account first.");
      return;
    }
    try {
      await NativePurchases.restorePurchases();
      const token = await refreshSubscription();
      window.alert(token ? "Your Growther Premium subscription was restored." : "No active Growther Premium subscription was found.");
    } catch (error) {
      window.alert(errorMessage(error));
    }
  }
  async function manageSubscription() {
    try {
      await NativePurchases.manageSubscriptions();
    } catch (error) {
      window.alert(errorMessage(error));
    }
  }
  function ensureSubscriptionActions() {
    if (!isAndroidApp()) return;
    const panel = document.querySelector("#gaPremiumOfferBackdrop .ga-premium-offer");
    if (!panel || panel.querySelector("[data-premium-actions]")) return;
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:center;gap:16px;align-items:center;margin:8px auto 0;position:relative;z-index:8";
    actions.dataset.premiumActions = "true";
    actions.hidden = !window.gaPremiumSubscriptionActive;
    const style = "border:0;background:transparent;color:#f3ddff;text-decoration:underline;font:600 12px system-ui;cursor:pointer;padding:5px 8px";
    const manage = document.createElement("button");
    manage.type = "button";
    manage.textContent = "Manage subscription";
    manage.dataset.premiumManage = "true";
    manage.hidden = !window.gaPremiumSubscriptionActive;
    manage.style.cssText = style;
    manage.addEventListener("click", manageSubscription);
    actions.append(manage);
    panel.append(actions);
  }
  window.gaPremiumChoosePlan = choosePlan;
  window.gaPremiumRestorePurchases = restorePurchases;
  window.gaGetActivePurchaseToken = activePurchaseToken;
  window.addEventListener("growther-auth-changed", (event) => {
    signedInAdult = event.detail?.signedIn === true && event.detail?.isAdult === true;
    if (signedInAdult) {
      fetchStoreProducts();
      refreshSubscription();
    } else {
      verifiedPurchaseToken = null;
      setPremium(false);
    }
  });
  window.gaBillingGetIdentity?.().then((identity) => {
    signedInAdult = identity?.signedIn === true && identity?.isAdult === true;
    if (signedInAdult) {
      fetchStoreProducts();
      refreshSubscription();
    }
  });
  new MutationObserver(ensureSubscriptionActions).observe(document.documentElement, { childList: true, subtree: true });
})();
/*! Bundled license information:

@capacitor/core/dist/index.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)
*/
