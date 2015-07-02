const DEFAULT_PAGE = "index.html";

// These are defined in the Hiram Pages Bridge documentation
const Q_PARAM_BRIDGE_PAGE = "x-hp-bridgepage";
const Q_PARAM_ROLE = "x-hp-role";
const Q_PARAM_EMAIL = "x-email";
const Q_PARAM_USERID = "x-userId";
const Q_PARAM_HP_ORGID = "x-hp-orgId";
const Q_PARAM_EXTRA = "x-hp-extra";
const Q_PARAM_SESSION_ID = "x-sessionId";
const Q_PARAM_EMAIL_SHA1 = "x-emailsha1";
const Q_PARAM_AUTH_SOURCE = "x-authsource";
const Q_PARAM_AWSAccessKeyId = "AWSAccessKeyId";
const Q_PARAM_AWSSessionToken = "x-amz-security-token";
const Q_PARAM_AWSSecretAccessKey = "AWSSecretAccessKey";
const Q_PARAM_AWSRegionId = "AWSRegionId";
const Q_PARAM_AWSBucket = "AWSBucket";
const Q_PARAM_AWSExpires = "Expires";

/**
 * Responsible for rendering the page provided by the Q_PARAM_BRIDGE_PAGE within the document's body and head.
 */
class PageManager{
    static getParameterByName(name, nullMe){
        let emptyResult = nullMe ? null : "";
        let normalizedName = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + normalizedName + "=([^&#]*)"),
            results = regex.exec(location.search);
        return results === null ? emptyResult : decodeURIComponent(results[1].replace(/\+/g, " "));
    };

    static isLocalhost(){
        let location = window.location.href;
        if(location && location.indexOf("localhost") > 0){
            return true;
        } else {
            return false;
        }
    }

    /**
     * Takes a requested path, i.e. "blog/archives/index.html"
     * and splits into separate components ->
     *      s3Key -> the key to use when fetching the resource, kind of like an absolute path
     *      filename -> the "filename" of the path, i.e. "index.html"
     *      directory -> the everything other than the file, i.e. "blog/archives/"
     * @param
     * @returns {{s3Key: *, filename: string, directory: *}}
     */
    static separatePathComponentsFrom(path){
        var absPath = path;
        var filename = "";
        var directory = null;

        if(path.indexOf("/") == 0)
            path = path.substring(1);

        var slashIndex = path.lastIndexOf("/");

        if(slashIndex > 0){
            directory = path.substring(0, slashIndex + 1);
            filename = path.substring(slashIndex + 1);
        }

        return {
            s3Key : absPath,
            filename : filename,
            directory : directory
        };
    }

    initSecurityService(options){
        if(this.isProd){
            var awsBucket = options.bucket || PageManager.getParameterByName(Q_PARAM_AWSBucket);
            var awsAccessKeyId = PageManager.getParameterByName(Q_PARAM_AWSAccessKeyId);
            var awsSecretAccessKey = PageManager.getParameterByName(Q_PARAM_AWSSecretAccessKey);
            var awsSessionToken = PageManager.getParameterByName(Q_PARAM_AWSSessionToken);
            var awsRegion = PageManager.getParameterByName(Q_PARAM_AWSRegionId);
            var expString = PageManager.getParameterByName(Q_PARAM_AWSExpires);
            var expires = null;
            if(expString){
                expires = Number(expString);
            }

            this.securityService = new AwsSecurityService(awsBucket, awsRegion, expires, awsAccessKeyId, awsSecretAccessKey, awsSessionToken);

        } else {
            var testBucket = options.bucket || PageManager.getParameterByName(Q_PARAM_AWSBucket, true) || "_build";
            this.securityService = new TestSecurityService(testBucket);
        }

        var builderPathComs = this.getBuilderPath(this.securityService.bucket);
        if(!this.isProd){
            builderPathComs = this.getBuilderPath("");
        }
        this.builderPath = builderPathComs.builderPath;
        this.builderDirectory = builderPathComs.builderDirectory || "";

        this.resolver = new PathResolver(this.directory, this.securityService, this.builderDirectory, this.builderPath);
    }

    constructor(providedOptions){
        let options = providedOptions || {};
        this.isProd = options.isProd || !PageManager.isLocalhost();
        this.hooks = options.hooks || {};

        var requestedPath = options.page || PageManager.getParameterByName(Q_PARAM_BRIDGE_PAGE, true) || DEFAULT_PAGE;
        var pathComponents = PageManager.separatePathComponentsFrom(requestedPath);

        this.directory = pathComponents.directory || options.directory || "";
        this.filename = pathComponents.filename;
        this.s3Key = pathComponents.s3Key;

        this.initSecurityService(options);
        this.resetScripts();
    }

    /**
     * The "main" loop of the page manager
     */
    render() {
        console.log(`Starting Hiram Pages Bridge version ${hpVersion} Rev ${hpRevShort}`);
        var mainsw = new StopWatch();
        mainsw.start();
        this.promptMoreInfo().then( () => {
            var signedPath = this.securityService.signPath(this.s3Key);
            return this.fetchItem(signedPath);
        }).then( (indexHtml) => {
            return this.acceptHtml(document.body, document.head, indexHtml);
        }).then( (result) => {
            console.log(`Done processing ${result} HTML nodes, now need to wait for remote scripts to load`);
            return this.waitForJavaScript();
        }).then( (result) => {
            console.log("All JavaScript sources loaded and ordered, now starting execution.");
            var jssw = new StopWatch();
            jssw.start();
            this.startJavaScript(document);
            jssw.stop();
            console.log("Done starting JavaScript, now adding observer to watch for changes");
            console.log("------------------");
            console.log(`Script Load Time = ${jssw.diff()} ms`);
            console.log("------------------");

            this.watchForAddedNodes(document.body);
            console.log("Hiram Pages Bridge is done and fully loaded.");
            mainsw.stop();
            console.log("------------------");
            console.log(`Success Render Time = ${mainsw.diff()} ms`);
            console.log("------------------");
        }).catch( (err) => {
            mainsw.stop();
            console.log("------------------");
            console.log(`Error Render Time = ${mainsw.diff()} ms`);
            console.log("------------------");
            console.error("Uncaught error", err);
            document.body.innerHTML += JSON.stringify({"Contact Hiram Pages" : err});
            throw err;
        });
    }

    promptMoreInfo(){
        return new Promise( (resolve, reject) => {
            // In a future version we may support providing encryption keys
            // This function is a placeholder for when we want to collect more information asynchronously
            resolve(true);
        });
    }

    acceptHtml (domBody, domHead, html){
        var self = this;

        return new Promise(function (resolve, reject) {
            // No longer relevant since we do a full page-load on each navigation
            //self.unloadDOM(domBody);
            //self.unloadDOM(domHead);

            var template = document.createElement("html");
            template.innerHTML = html;

            self.resetScripts();

            // Step 1: Go through and add styles, first
            // Step 2: Go through and add dom elements
            // Step 3: Go through and fetch all JavaScript

            self.acceptAllLinkedStyles(template, domHead, self.resolver)
                .then( (isDone) => {
                    var iterGroups = [
                        {
                            query : "head > *",
                            domParent : domHead
                        },
                        {
                            query : "body > *",
                            domParent : domBody
                        }
                    ];

                    var numberChildrenProcessed = 0;
                    for(var j=0;j<iterGroups.length;j++) {
                        var group = iterGroups[j];
                        var items = template.querySelectorAll(group.query);
                        for (var i =0;i<items.length;i++) {

                            var elem = items[i];
                            numberChildrenProcessed++;
                            self.fixItem(elem, self.resolver).then( (fixedElem) => {

                                var tagname = "";
                                //console.log("fie=", fixedElem);
                                if(fixedElem.tagName){
                                    tagname = fixedElem.tagName.toLowerCase();
                                }

                                if (tagname == "script") {
                                    //console.log("Adding script..." ,fixedElem);
                                    domHead.appendChild(fixedElem);
                                    self.acceptJavaScript(fixedElem);
                                }
                                else if (tagname == "link") {
                                    // skip over it since we already added the css styling
                                }
                                else {
                                    group.domParent.appendChild(fixedElem);
                                }

                            }).catch( (err) => {
                                console.log("Error fixing item", err);
                            });
                        }
                    }

                    // special case, plain-text files
                    if(numberChildrenProcessed == 0){
                        console.log("Accepting the page as plain text");
                        domBody.innerHTML = template.innerHTML;
                    }
                    resolve(numberChildrenProcessed);
                })
                .catch( (err) => {
                    reject(err);
                });

        });
    };

    watchForAddedNodes (domItem){
        var target = domItem;//.querySelector("document");
        var self = this;
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                //console.log("Mutation event = ", mutation);
                if(mutation.type == 'childList')
                {
                    //console.log("Fixing new or removed elements, possibly");
                    for(var i=0;i<mutation.addedNodes.length;i++){
                        var node = mutation.addedNodes[i];
                        if(node.dataset && node.dataset.hiramPagesFixed)
                        {

                        }
                        else {
                            //console.log("Fixing ", node);
                            self.fixItem(node, self.resolver);
                        }
                    }
                }
                else if (mutation.type == 'attributes')
                {
                    console.log("Fixing changed attributes", mutation.attributeName);
                    //self.fixItem(mutation.target, self.resolver);
                }
                else
                {
                    console.log("Fixing changed object possibly");
                    //self.fixItem(mutation.target, self.resolver);
                }

            });
        });

        var config = {
            attributes: false,
            childList: true,
            characterData: false,
            subtree: true//,
            //attributeFilter : ['src', 'href']
        };

        observer.observe(target, config);
    };

    /**
     * Goes through each "link" tag and adds it to the realDom
     * @param templateDom
     * @param realDom
     * @returns {Promise}
     */
    acceptAllLinkedStyles(templateDom, realDom, linkResolver){

        function resolveCssUrls(resolver, style){
            var urlRe = /url\s*\('{0,1}"{0,1}(.+?)"{0,1}'{0,1}\)/g;
            return style.replace(urlRe, function(match, $1){
                var cssRelPath = resolver.fixRef($1, false);
                //console.log("CSS Replace", $1, cssRelPath);
                return 'url("' + cssRelPath + '")';
            });
        };

        var self = this;

        return new Promise( (resolve, reject) => {
            var latch = 0;
            function acceptLinkNode(elem){
                latch++;
                var href = elem.getAttribute('href');
                self.fetchItem(href).then( (cssLiteral) => {
                    var styleDom = document.createElement("style");
                    elem.removeAttribute('href');
                    var lastSlash = elem.dataset.originalUrl.lastIndexOf("/");
                    var cssPath = elem.dataset.originalUrl.substring(0, lastSlash);
                    var cssResolver = new PathResolver(cssPath, self.securityService, this.builderDirectory, this.builderPath);
                    var fixedStyle = resolveCssUrls(cssResolver, cssLiteral);
                    styleDom.innerHTML = fixedStyle;
                    realDom.appendChild(styleDom);
                    latch--;

                    if(latch == 0){
                        resolve(true);
                    }

                }).catch( (err) => {
                    console.log("Failed to get link element with href = ", href, err);
                    latch--;

                    if(latch == 0){
                        resolve(true);
                    }
                })
            }

            var selectedLinks = templateDom.querySelectorAll("link");
            for(var i=0;i<selectedLinks.length;i++) {
                var linkElem = selectedLinks[i];
                if(linkResolver.fixRefsInElem(linkElem)) {
                    acceptLinkNode(linkElem);
                } else {
                    console.warn("Could not resolve link element", linkElem);
                }
            }

            if(selectedLinks.length == 0)
            {
                resolve(true);
            }
        });
    }

    fixItem(domItem, linkResolver){
        return new Promise( (resolve, reject) => {
            var children = domItem.childNodes || [];
            for(var i=0;i<children.length;i++){
                var child = children[i];
                this.fixItem(child, linkResolver);
            }

            if(!domItem.tagName){
                resolve(domItem);
                return;
            }

            linkResolver.fixRefsInElem(domItem);

            resolve(domItem);
        });
    }

    resetScripts(){
        this.scripts = [];
        this.scriptLatch = 0;
    }

    acceptJavaScript(scriptDom){
        scriptDom.dataset = scriptDom.dataset || {};

        scriptDom.dataset.hiramEvalOrder = this.scripts.length;
        this.scripts.push(scriptDom);
        var self = this;
        var src = scriptDom.getAttribute('src');

        if(src)
        {
            //console.log("Accepting script src = ", src);
            this.fetchItem(src).then( (script) => {
                scriptDom.removeAttribute('src');
                scriptDom.setAttribute('type', 'text/javascript');
                scriptDom.innerHTML = script;
                if(self.isProd == false && self.isLiveloadScript(script)){
                    scriptDom.dataset.hiramShouldEval = false;
                } else {
                    scriptDom.dataset.hiramShouldEval = true;
                }
                //console.log("Incrementing latch");
                self.scriptLatch++;
            }).catch( (err) => {
                console.error("Failed to fetch src", err);
                //console.log("Incrementing latch");
                self.scriptLatch++;
            });
        }
        else
        {
            //console.log("Accepting inline script");
            if(self.isProd == false && self.isLiveloadScript(scriptDom.innerHTML) ){
                scriptDom.dataset.hiramShouldEval = false;
            } else {
                scriptDom.dataset.hiramShouldEval = true;
            }
            self.scriptLatch++;
        }
    }

    isLiveloadScript(script){
        // put your favorite keyword here to filter out evaling during local development
        let liveloadnames = ['livereload'];
        var hasOne = false;
        for(var i=0;i<liveloadnames.length;i++){
            if(script.indexOf(liveloadnames[i]) >= 0){
                hasOne = true;
            }
        }
        return hasOne;
    }

    waitForJavaScript() {
        var self = this;

        return new Promise((resolve, reject) => {
            var timeoutCount = 0;

            function waitUntilCanRun() {

                if (timeoutCount > 100) {
                    console.error("Timeout condition for starting JavaScript");
                    reject("Timed out waiting for scripts to load");
                    return -1;
                }

                if (self.scriptLatch == self.scripts.length) {
                    return 1;
                } else {
                    return 0;
                }
            };

            var timer = setInterval(() => {
                var result = waitUntilCanRun();
                //console.log ("Wait Until Can Run = ", result);
                if (result > 0) {
                    clearInterval(timer);
                    resolve(true);
                } else if (result < 0){
                    clearInterval(timer);
                    reject(false);
                }
                else {
                    //console.log("Interval", timeoutCount);
                }
            }, 500);

        });
    };

    startJavaScript(domDoc) {

        console.log("Starting javascript...");


        for (var i = 0; i < this.scripts.length; i++) {
            var scriptElem = this.scripts[i];
            if (scriptElem.dataset && scriptElem.dataset.hiramShouldEval == "true") {
                //console.log("Evaling", scriptElem.dataset.originalSrc);
                var script = scriptElem.innerHTML;
                try {
                    var context = scriptElem.dataset.originalUrl;
                    if(!context){
                        context = script;
                    }
                    //console.log("script.length = ", script.length, context);
                    var output = eval(script);
                }
                catch (e) {
                    console.error(e);
                }
            } else {
                //console.log("Skipping because previoulsy we marked this script tag should be ignored", scriptElem.dataset.originalSrc);
            }
        }

    }

    /**
     * Removes all childnodes from the requested domItem
     * @param domItem
     * @returns {*}
     */
    unloadDOM(domItem){
        if(!domItem || !domItem.childNodes) {
            return domItem;
        }

        for(var child of domItem.childNodes){
            if(child) {
                if (child.dataset && child.dataset.hiramProtected) {
                    // ignore
                    //console.log("Skipping", child);
                }
                else {
                    domItem.removeChild(child);
                }
            }
        }
        return domItem;
    };

    /**
     * Retrieves a remote resource using XHR
     * Use XHR over the AWS getObject because many remote resources
     * are on CDNs, hence the preference to generate signed urls
     * @param path
     * @returns {Promise}
     */
    fetchItem(path){
        var self = this;
        return new Promise(function (resolve, reject) {
            try {
                function reqListener(evt) {
                    if(evt.target.status == 200) {
                        resolve(evt.target.responseText)
                    } else {
                        reject(evt.target.statusText);
                    }
                }

                var oReq = new XMLHttpRequest();

                oReq.onload = reqListener;
                oReq.onerror = function (evt) {
                    reject(evt);
                };

                // TODO: When supporting CORS, add in a way to set this
                /*
                 if(path.indexOf("hirampages") >= 0 || path.indexOf("localhost") >= 0){
                 oReq.withCredentials = true;
                 }
                 */
                oReq.open("GET", path, true);
                oReq.send();
            }
            catch(err){
                reject(err);
            }
        });
    };

    getBuilderPath(bucket) {
        var currentPath = window.location.pathname;

        var bucketCut = currentPath.indexOf(bucket);
        if(bucketCut < 0)
            bucketCut = 0;
        var pathWithoutBucket = currentPath.substring(bucketCut + bucketCut.length);

        var lastSlash = pathWithoutBucket.lastIndexOf("/");
        var builderDir = pathWithoutBucket.substring(0, lastSlash);
        var builderPath = pathWithoutBucket.substring(lastSlash + 1);
        return {
            builderDirectory : builderDir,
            builderPath: builderPath
        };
    };

}

/**
 * Responsible for calculating the relative paths based on the actual values in src and href
 *
 * This is necessary because many client-side paths assume server-side behavior (i.e. index documents)
 * that need to be resolved to work in an environment without any server-side behavior.
 */
class PathResolver{
    constructor(callerDirectory, securityService, builderDirectory, builderPath){
        this.cwd = callerDirectory;
        if(this.cwd.lastIndexOf('/') == this.cwd.length - 1){
            this.cwd = this.cwd.substring(0, this.cwd.length - 1);
        }
        this.securityService = securityService;
        this.builderDirectory = builderDirectory;
        this.builderPath = builderPath;
    }

    fixRef(requestedPath, isALink){
        if(this.shouldFixPath(requestedPath)){
            var fixedPath = this.fixPath(requestedPath, this.cwd, isALink);
            //console.log("FixedPath = ", fixedPath, requestedPath);
            var collapsedPath = this.collapseDots(fixedPath);

            if( isALink && collapsedPath.indexOf(".htm") > 0 ) {
                var builderPath = this.builderPath;
                // this is the new bootstrap page path
                var signedPath = this.securityService.signPath(builderPath);
                var linkWithSecurity = this.securityService.appendSecurityToPath(signedPath);
                var bridgedPath = this.appendPageInfoToPath(linkWithSecurity, collapsedPath);

                return bridgedPath;
            } else {

                var signedPath = this.securityService.signPath(collapsedPath);
                return signedPath;
            }
        } else {
            return requestedPath;
        }
    }

    /**
     * Fixes the url reference within the dom element.
     *
     * This method MUTATES the dom element
     *
     * @returns {boolean} true if there is a path ready to fetch
     */
    fixRefsInElem(elem){
        if(!elem|| !elem.getAttribute){
            return false;
        }

        var src = elem.getAttribute('src');
        var href = elem.getAttribute('href');

        var requestedPath = src || href;
        if(!requestedPath)
            return false;

        if(elem.dataset && elem.dataset.hiramPagesFixed) {
            return true;
        }

        var isALink = elem.tagName.toLowerCase() == "a";

        var fixedPath = this.fixRef(requestedPath, isALink);

        if(src) {
            elem.setAttribute('src', fixedPath);
        }
        else if(href){
            elem.setAttribute('href', fixedPath);
        }
        else {
            // If you are reading the source code and are curious...
            // Contact me :)
            elem.setAttribute('uri', fixedPath);
        }

        elem.setAttribute('data-original-url', requestedPath);
        elem.setAttribute('data-hiram-pages-fixed', true);

        return true;
    }

    fixPath(path, cwd, defaultToHtml)
    {
        var fixedPath = "";
        // Step 1: Fix up absolute vs relative pathing
        if(this.isAbsolutePath(path)){
            // remove preceeding slash
            //fixedPath = cwd + "/" + fixedPath.substring(1);
            fixedPath = "";
            var basePath = cwd || "";
            var numUp = basePath.split("/").length;
            for(var i=0;i<numUp;i++)
            {
                fixedPath += "../";
            }
            fixedPath += path.substring(1);
        }
        else {
            if(cwd.length > 0) {
                fixedPath = cwd + "/" + path;
            }
            else {
                fixedPath = path;
            }
        }

        var filenameCut = fixedPath.lastIndexOf("/");
        var filename = fixedPath;
        if(filenameCut >= 0){
            filename = fixedPath.substring(filenameCut+1);
        }

        // Step 2: Determine target resource
        if (fixedPath.lastIndexOf('/') == fixedPath.length - 1)
        {
            fixedPath += DEFAULT_PAGE;
        }
        else if (fixedPath.length == 0 || fixedPath == ".")
        {
            fixedPath = DEFAULT_PAGE;
        }
        else if (fixedPath == "..")
        {
            fixedPath = "../" + DEFAULT_PAGE;
        }
        else if (filename.indexOf(".") < 0){
            if(defaultToHtml){
                fixedPath += "/" + DEFAULT_PAGE;
            }
            else {
                // do nothing
            }
        }
        return fixedPath;
    };

    shouldFixPath(path){
        // if the base path is on an external system, then don't worry about fixing
        // up the reference
        if(this.isExternalPath(this.cwd)){
            return false;
        }
        else if(path && path.length > 0){
            // The path is an achor tag on the current page
            if(path.indexOf("#") == 0) {
                return false;
            }
            // The path refers to somewhere outside of the local bucket
            else if (this.isExternalPath(path))
            {
                return false;
            }
            // The path has already been signed
            else if(path.indexOf(Q_PARAM_AWSAccessKeyId) >= 0){
                return false;
            }
            else
            {
                return true;
            }
        }
        else
        {
            return false;
        }
    }

    isAbsolutePath(path){
        var pathToTest = path || this.path;
        if(!pathToTest){
            return false;
        }

        return pathToTest.indexOf("/") == 0;
    }

    /**
     *
     * @param path
     * @returns {boolean} true if path refers to somewhere else on the internet
     */
    isExternalPath(path){
        var pathToTest = path || this.path;
        if(!pathToTest){
            return false;
        }

        return  pathToTest.indexOf("://") > 0 ||
                pathToTest.indexOf("//") == 0 ||
                pathToTest.indexOf("data:") >= 0;
    }

    /**
     * AWS treats file paths as keys, so "my/path/./to/here" != "my/path/to/here"
     * We have to remove the stray dots
     * @param path
     * @returns {*}
     */
    collapseDots (path){
        var parts = path.split("/");
        var retPath = [];
        for(var i=0;i<parts.length;i++)
        {
            var part = parts[i];
            if(part == ".")
            {
                // skip over this part
            }
            else if (part == "..")
            {
                // pop the previous
                if(retPath.length > 0)
                {

                    var popped = retPath.pop();
                }
                else
                {
                    // there is an error with this path, so we'll ignore this part
                    console.error("retPath.length == 0");
                }
            }
            else
            {
                // add the part
                retPath.push(part);
            }
        }
        if(retPath.length > 0) {
            return retPath.join("/");
        }
        else
        {
            return path;
        }
    };

    appendPageInfoToPath(signedBridgePath, resolvedPagePath){
        return signedBridgePath +
            "&" + Q_PARAM_BRIDGE_PAGE + "=" + resolvedPagePath;
    }
}

/**
 * Responsible for adding necessary security signatures to a given path
 */
class AwsSecurityService{
    constructor(bucket, region, expires, accessKeyId, secretAccessKey, sessionToken){
        this.acceptCreds(bucket, region, expires, accessKeyId, secretAccessKey, sessionToken);
    }

    acceptCreds(bucket, region, expires, accessKeyId, secretAccessKey, sessionToken){
        this.bucket = bucket;
        this.region = region;
        this.expires = Number(expires) || new Date().getUTCSeconds() + 3600;
        this.awsAccessKeyId = accessKeyId;
        this.awsSecretAccessKey = secretAccessKey;
        this.awsSessionToken = sessionToken;

        var config = new AWS.Config({
            accessKeyId: this.awsAccessKeyId,
            secretAccessKey: this.awsSecretAccessKey,
            sessionToken : this.awsSessionToken,
            region: this.region
        });

        AWS.config = config;

        this.s3 = new AWS.S3();
    }

    signPath(path){
        var exp  = undefined;
        // This is to help the browser with caching
        if(this.expires){
            exp = this.expires - (Date.now() / 1000);
        }
        var params = {Bucket: this.bucket, Key: path, Expires: exp};
        var url = this.s3.getSignedUrl('getObject', params);
        return url;
    }

    appendSecurityToPath(signedBridgePath){
        return signedBridgePath +
        "&" + Q_PARAM_AWSBucket + "=" + encodeURIComponent(this.bucket) +
        "&" + Q_PARAM_AWSRegionId + "=" + encodeURIComponent(this.region) +
        "&" + Q_PARAM_AWSSecretAccessKey + "=" + encodeURIComponent(this.awsSecretAccessKey)
    }

}

/**
 * Drop-in replacement for AWS Security Service to use during development
 */
class TestSecurityService{
    constructor(bucket){
        console.log("Using Test Security Service for localhost development");
        this.expires = new Date().getUTCSeconds() + 3600;
        this.bucket = bucket;
    }

    signPath(path){
        var exp  = this.expires - (Date.now() / 1000);
        if(path == "hp-bridge.html"){
            return "http://localhost:8080/" + path + "?x-local-dev=true&Expires=" + exp;
        } else {
            return "http://localhost:8080/" + this.bucket + "/" + path + "?x-local-dev=true&Expires=" + exp;
        }
    }

    appendSecurityToPath(signedBridgePath){
        return signedBridgePath +
            "&" + Q_PARAM_AWSBucket + "=" + encodeURIComponent(this.bucket);
    }
}

/**
 * Limited profiling
 */
class StopWatch{
    constructor(){
        this.reset();
        this.hookApi();
    }

    hookApi() {
        window.Performance = window.Performance || {};

        this.now = window.Performance.now || window.Performance.webkitNow || function () {
            return new Date().getUTCMilliseconds();
        }
    }

    start(){
        this.t0 = this.now();
    }

    stop(){
        this.t1 = this.now();
    }

    diff(){
        return Math.abs(this.t1 - this.t0);
    }

    reset(){
        this.t0 = 0;
        this.t1 = 1;
    }
}

function start(){
    var page = new PageManager({});

    page.render();
}

start();