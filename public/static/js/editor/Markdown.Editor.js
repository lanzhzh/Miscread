﻿// needs Markdown.Converter.js at the moment

(function () {

    var util = {},
        position = {},
        ui = {},
        doc = window.document,
        re = window.RegExp,
        nav = window.navigator,
        SETTINGS = { lineLength: 72 },

    // Used to work around some browser bugs where we can't use feature testing.
        uaSniffed = {
            isIE: /msie/.test(nav.userAgent.toLowerCase()),
            isIE_5or6: /msie 6/.test(nav.userAgent.toLowerCase()) || /msie 5/.test(nav.userAgent.toLowerCase()),
            isOpera: /opera/.test(nav.userAgent.toLowerCase())
        };


    // -------------------------------------------------------------------
    //  YOUR CHANGES GO HERE
    //
    // I've tried to localize the things you are likely to change to 
    // this area.
    // -------------------------------------------------------------------

    // The text that appears on the upper part of the dialog box when
    // entering links.
    var linkDialogText = "<p>http://example.com/ \"optional title\"</p>";
    var imageDialogText = "<p>http://example.com/images/diagram.jpg \"optional title\"</p>";

    // The default text that appears in the dialog input box when entering
    // links.
    var imageDefaultText = "http://";
    var linkDefaultText = "http://";

    var defaultHelpHoverTitle = "编辑器语法帮助";

    // -------------------------------------------------------------------
    //  END OF YOUR CHANGES
    // -------------------------------------------------------------------

    // help, if given, should have a property "handler", the click handler for the help button,
    // and can have an optional property "title" for the button's tooltip (defaults to "Markdown Editing Help").
    // If help isn't given, not help button is created.
    //
    // The constructed editor object has the methods:
    // - getConverter() returns the markdown converter object that was passed to the constructor
    // - run() actually starts the editor; should be called after all necessary plugins are registered. Calling this more than once is a no-op.
    // - refreshPreview() forces the preview to be updated. This method is only available after run() was called.
    Markdown.Editor = function (markdownConverter, container, preview, help) {

        var hooks = this.hooks = new Markdown.HookCollection();
        hooks.addNoop("onPreviewRefresh");       // called with no arguments after the preview has been refreshed
        hooks.addNoop("postBlockquoteCreation"); // called with the user's selection *after* the blockquote was created; should return the actual to-be-inserted text
        hooks.addFalse("insertImageDialog");     /* called with one parameter: a callback to be called with the URL of the image. If the application creates
                                                  * its own image insertion dialog, this hook should return true, and the callback should be called with the chosen
                                                  * image url (or null if the user cancelled). If this hook returns false, the default dialog will be used.
                                                  */

        this.getConverter = function () { return markdownConverter; }

        var that = this,
            panels;

        this.run = function () {
            if (panels)
                return; // already initialized

            panels = new PanelCollection(container, preview);
            var commandManager = new CommandManager(hooks);
            var previewManager = new PreviewManager(markdownConverter, panels, function () { hooks.onPreviewRefresh(); });
            var undoManager, uiManager;

            if (!/\?noundo/.test(doc.location.href)) {
                undoManager = new UndoManager(function () {
                    previewManager.refresh();
                    if (uiManager) // not available on the first call
                        uiManager.setUndoRedoButtonStates();
                }, panels);
                this.textOperation = function (f) {
                    undoManager.setCommandMode();
                    f();
                    that.refreshPreview();
                }
            }

            uiManager = new UIManager(panels, undoManager, previewManager, commandManager, help);
            uiManager.setUndoRedoButtonStates();

            var forceRefresh = that.refreshPreview = function () { previewManager.refresh(true); };

            forceRefresh();
        };

    }

    // before: contains all the text in the input box BEFORE the selection.
    // after: contains all the text in the input box AFTER the selection.
    function Chunks() { }

    // startRegex: a regular expression to find the start tag
    // endRegex: a regular expresssion to find the end tag
    Chunks.prototype.findTags = function (startRegex, endRegex) {

        var chunkObj = this;
        var regex;

        if (startRegex) {

            regex = util.extendRegExp(startRegex, "", "$");

            this.before = this.before.replace(regex,
                function (match) {
                    chunkObj.startTag = chunkObj.startTag + match;
                    return "";
                });

            regex = util.extendRegExp(startRegex, "^", "");

            this.selection = this.selection.replace(regex,
                function (match) {
                    chunkObj.startTag = chunkObj.startTag + match;
                    return "";
                });
        }

        if (endRegex) {

            regex = util.extendRegExp(endRegex, "", "$");

            this.selection = this.selection.replace(regex,
                function (match) {
                    chunkObj.endTag = match + chunkObj.endTag;
                    return "";
                });

            regex = util.extendRegExp(endRegex, "^", "");

            this.after = this.after.replace(regex,
                function (match) {
                    chunkObj.endTag = match + chunkObj.endTag;
                    return "";
                });
        }
    };

    // If remove is false, the whitespace is transferred
    // to the before/after regions.
    //
    // If remove is true, the whitespace disappears.
    Chunks.prototype.trimWhitespace = function (remove) {
        var beforeReplacer, afterReplacer, that = this;
        if (remove) {
            beforeReplacer = afterReplacer = "";
        } else {
            beforeReplacer = function (s) { that.before += s; return ""; }
            afterReplacer = function (s) { that.after = s + that.after; return ""; }
        }
        
        this.selection = this.selection.replace(/^(\s*)/, beforeReplacer).replace(/(\s*)$/, afterReplacer);
    };


    Chunks.prototype.skipLines = function (nLinesBefore, nLinesAfter, findExtraNewlines) {

        if (nLinesBefore === undefined) {
            nLinesBefore = 1;
        }

        if (nLinesAfter === undefined) {
            nLinesAfter = 1;
        }

        nLinesBefore++;
        nLinesAfter++;

        var regexText;
        var replacementText;

        // chrome bug ... documented at: http://meta.stackoverflow.com/questions/63307/blockquote-glitch-in-editor-in-chrome-6-and-7/65985#65985
        if (navigator.userAgent.match(/Chrome/)) {
            "X".match(/()./);
        }

        this.selection = this.selection.replace(/(^\n*)/, "");

        this.startTag = this.startTag + re.$1;

        this.selection = this.selection.replace(/(\n*$)/, "");
        this.endTag = this.endTag + re.$1;
        this.startTag = this.startTag.replace(/(^\n*)/, "");
        this.before = this.before + re.$1;
        this.endTag = this.endTag.replace(/(\n*$)/, "");
        this.after = this.after + re.$1;

        if (this.before) {

            regexText = replacementText = "";

            while (nLinesBefore--) {
                regexText += "\\n?";
                replacementText += "\n";
            }

            if (findExtraNewlines) {
                regexText = "\\n*";
            }
            this.before = this.before.replace(new re(regexText + "$", ""), replacementText);
        }

        if (this.after) {

            regexText = replacementText = "";

            while (nLinesAfter--) {
                regexText += "\\n?";
                replacementText += "\n";
            }
            if (findExtraNewlines) {
                regexText = "\\n*";
            }

            this.after = this.after.replace(new re(regexText, ""), replacementText);
        }
    };

    // end of Chunks 

    // A collection of the important regions on the page.
    // Cached so we don't have to keep traversing the DOM.
    // Also holds ieCachedRange and ieCachedScrollTop, where necessary; working around
    // this issue:
    // Internet explorer has problems with CSS sprite buttons that use HTML
    // lists.  When you click on the background image "button", IE will 
    // select the non-existent link text and discard the selection in the
    // textarea.  The solution to this is to cache the textarea selection
    // on the button's mousedown event and set a flag.  In the part of the
    // code where we need to grab the selection, we check for the flag
    // and, if it's set, use the cached area instead of querying the
    // textarea.
    //
    // This ONLY affects Internet Explorer (tested on versions 6, 7
    // and 8) and ONLY on button clicks.  Keyboard shortcuts work
    // normally since the focus never leaves the textarea.
    function PanelCollection(container, preview) {
        this.buttonBar = container.find('#wmd-button-bar')[0];
        this.preview = preview[0];
        this.input = container.find('#wmd-input')[0];
    };

    // Returns true if the DOM element is visible, false if it's hidden.
    // Checks if display is anything other than none.
    util.isVisible = function (elem) {

        if (window.getComputedStyle) {
            // Most browsers
            return window.getComputedStyle(elem, null).getPropertyValue("display") !== "none";
        }
        else if (elem.currentStyle) {
            // IE
            return elem.currentStyle["display"] !== "none";
        }
    };


    // Adds a listener callback to a DOM element which is fired on a specified
    // event.
    util.addEvent = function (elem, event, listener) {
        if (elem.attachEvent) {
            // IE only.  The "on" is mandatory.
            elem.attachEvent("on" + event, listener);
        }
        else {
            // Other browsers.
            elem.addEventListener(event, listener, false);
        }
    };


    // Removes a listener callback from a DOM element which is fired on a specified
    // event.
    util.removeEvent = function (elem, event, listener) {
        if (elem.detachEvent) {
            // IE only.  The "on" is mandatory.
            elem.detachEvent("on" + event, listener);
        }
        else {
            // Other browsers.
            elem.removeEventListener(event, listener, false);
        }
    };

    // Converts \r\n and \r to \n.
    util.fixEolChars = function (text) {
        text = text.replace(/\r\n/g, "\n");
        text = text.replace(/\r/g, "\n");
        return text;
    };

    // Extends a regular expression.  Returns a new RegExp
    // using pre + regex + post as the expression.
    // Used in a few functions where we have a base
    // expression and we want to pre- or append some
    // conditions to it (e.g. adding "$" to the end).
    // The flags are unchanged.
    //
    // regex is a RegExp, pre and post are strings.
    util.extendRegExp = function (regex, pre, post) {

        if (pre === null || pre === undefined) {
            pre = "";
        }
        if (post === null || post === undefined) {
            post = "";
        }

        var pattern = regex.toString();
        var flags;

        // Replace the flags with empty space and store them.
        pattern = pattern.replace(/\/([gim]*)$/, function (wholeMatch, flagsPart) {
            flags = flagsPart;
            return "";
        });

        // Remove the slash delimiters on the regular expression.
        pattern = pattern.replace(/(^\/|\/$)/g, "");
        pattern = pre + pattern + post;

        return new re(pattern, flags);
    }

    // UNFINISHED
    // The assignment in the while loop makes jslint cranky.
    // I'll change it to a better loop later.
    position.getTop = function (elem, isInner) {
        var result = elem.offsetTop;
        if (!isInner) {
            while (elem = elem.offsetParent) {
                result += elem.offsetTop;
            }
        }
        return result;
    };

    position.getHeight = function (elem) {
        return elem.offsetHeight || elem.scrollHeight;
    };

    position.getWidth = function (elem) {
        return elem.offsetWidth || elem.scrollWidth;
    };

    position.getPageSize = function () {

        var scrollWidth, scrollHeight;
        var innerWidth, innerHeight;

        // It's not very clear which blocks work with which browsers.
        if (self.innerHeight && self.scrollMaxY) {
            scrollWidth = doc.body.scrollWidth;
            scrollHeight = self.innerHeight + self.scrollMaxY;
        }
        else if (doc.body.scrollHeight > doc.body.offsetHeight) {
            scrollWidth = doc.body.scrollWidth;
            scrollHeight = doc.body.scrollHeight;
        }
        else {
            scrollWidth = doc.body.offsetWidth;
            scrollHeight = doc.body.offsetHeight;
        }

        if (self.innerHeight) {
            // Non-IE browser
            innerWidth = self.innerWidth;
            innerHeight = self.innerHeight;
        }
        else if (doc.documentElement && doc.documentElement.clientHeight) {
            // Some versions of IE (IE 6 w/ a DOCTYPE declaration)
            innerWidth = doc.documentElement.clientWidth;
            innerHeight = doc.documentElement.clientHeight;
        }
        else if (doc.body) {
            // Other versions of IE
            innerWidth = doc.body.clientWidth;
            innerHeight = doc.body.clientHeight;
        }

        var maxWidth = Math.max(scrollWidth, innerWidth);
        var maxHeight = Math.max(scrollHeight, innerHeight);
        return [maxWidth, maxHeight, innerWidth, innerHeight];
    };

    // Handles pushing and popping TextareaStates for undo/redo commands.
    // I should rename the stack variables to list.
    function UndoManager(callback, panels) {

        var undoObj = this;
        var undoStack = []; // A stack of undo states
        var stackPtr = 0; // The index of the current state
        var mode = "none";
        var lastState; // The last state
        var timer; // The setTimeout handle for cancelling the timer
        var inputStateObj;

        // Set the mode for later logic steps.
        var setMode = function (newMode, noSave) {
            if (mode != newMode) {
                mode = newMode;
                if (!noSave) {
                    saveState();
                }
            }

            if (!uaSniffed.isIE || mode != "moving") {
                timer = setTimeout(refreshState, 1);
            }
            else {
                inputStateObj = null;
            }
        };

        var refreshState = function (isInitialState) {
            inputStateObj = new TextareaState(panels, isInitialState);
            timer = undefined;
        };

        this.setCommandMode = function () {
            mode = "command";
            saveState();
            timer = setTimeout(refreshState, 0);
        };

        this.canUndo = function () {
            return stackPtr > 1;
        };

        this.canRedo = function () {
            if (undoStack[stackPtr + 1]) {
                return true;
            }
            return false;
        };

        // Removes the last state and restores it.
        this.undo = function () {

            if (undoObj.canUndo()) {
                if (lastState) {
                    // What about setting state -1 to null or checking for undefined?
                    lastState.restore();
                    lastState = null;
                }
                else {
                    undoStack[stackPtr] = new TextareaState(panels);
                    undoStack[--stackPtr].restore();

                    if (callback) {
                        callback();
                    }
                }
            }

            mode = "none";
            panels.input.focus();
            refreshState();
        };

        // Redo an action.
        this.redo = function () {

            if (undoObj.canRedo()) {

                undoStack[++stackPtr].restore();

                if (callback) {
                    callback();
                }
            }

            mode = "none";
            panels.input.focus();
            refreshState();
        };

        // Push the input area state to the stack.
        var saveState = function () {
            var currState = inputStateObj || new TextareaState(panels);

            if (!currState) {
                return false;
            }
            if (mode == "moving") {
                if (!lastState) {
                    lastState = currState;
                }
                return;
            }
            if (lastState) {
                if (undoStack[stackPtr - 1].text != lastState.text) {
                    undoStack[stackPtr++] = lastState;
                }
                lastState = null;
            }
            undoStack[stackPtr++] = currState;
            undoStack[stackPtr + 1] = null;
            if (callback) {
                callback();
            }
        };

        var handleCtrlYZ = function (event) {

            var handled = false;

            if (event.ctrlKey || event.metaKey) {

                // IE and Opera do not support charCode.
                var keyCode = event.charCode || event.keyCode;
                var keyCodeChar = String.fromCharCode(keyCode);

                switch (keyCodeChar) {

                    case "y":
                        undoObj.redo();
                        handled = true;
                        break;

                    case "z":
                        if (!event.shiftKey) {
                            undoObj.undo();
                        }
                        else {
                            undoObj.redo();
                        }
                        handled = true;
                        break;
                }
            }

            if (handled) {
                if (event.preventDefault) {
                    event.preventDefault();
                }
                if (window.event) {
                    window.event.returnValue = false;
                }
                return;
            }
        };

        // Set the mode depending on what is going on in the input area.
        var handleModeChange = function (event) {

            if (!event.ctrlKey && !event.metaKey) {

                var keyCode = event.keyCode;

                if ((keyCode >= 33 && keyCode <= 40) || (keyCode >= 63232 && keyCode <= 63235)) {
                    // 33 - 40: page up/dn and arrow keys
                    // 63232 - 63235: page up/dn and arrow keys on safari
                    setMode("moving");
                }
                else if (keyCode == 8 || keyCode == 46 || keyCode == 127) {
                    // 8: backspace
                    // 46: delete
                    // 127: delete
                    setMode("deleting");
                }
                else if (keyCode == 13) {
                    // 13: Enter
                    setMode("newlines");
                }
                else if (keyCode == 27) {
                    // 27: escape
                    setMode("escape");
                }
                else if ((keyCode < 16 || keyCode > 20) && keyCode != 91) {
                    // 16-20 are shift, etc. 
                    // 91: left window key
                    // I think this might be a little messed up since there are
                    // a lot of nonprinting keys above 20.
                    setMode("typing");
                }
            }
        };

        var setEventHandlers = function () {
            util.addEvent(panels.input, "keypress", function (event) {
                // keyCode 89: y
                // keyCode 90: z
                if ((event.ctrlKey || event.metaKey) && (event.keyCode == 89 || event.keyCode == 90)) {
                    event.preventDefault();
                }
            });

            var handlePaste = function () {
                if (uaSniffed.isIE || (inputStateObj && inputStateObj.text != panels.input.value)) {
                    if (timer == undefined) {
                        mode = "paste";
                        saveState();
                        refreshState();
                    }
                }
            };

            util.addEvent(panels.input, "keydown", handleCtrlYZ);
            util.addEvent(panels.input, "keydown", handleModeChange);
            util.addEvent(panels.input, "keydown", function (e) {
                if (e.keyCode === 13 || e.keyCode === 10) { 
                    get(panels.input);
                    var cursor = caretPosition,
                        lines = panels.input.value.split(/\r?\n/),
                        count = 0, linecount = 0, preLine = "";
                    for (var i = 0; i < lines.length; i++){
                        if (count <= cursor && (count + lines[i].length + 1) > cursor) {
                            preLine = lines[i];
                            if(document.all) {
                                linecount = i;
                            }
                            break;
                        }
                        count += lines[i].length + 1;
                    }
                            
                    if(/^(\-|\d\.)/i.test(preLine)){
                        var matches = preLine.match(/(\-|\d\.)/i);
                        var block = '';
                        switch(matches[1]){
                            case '-' :
                                block = '\n- ';
                                break;
                            default :
                                block = '\n' + (parseInt(matches[1].substring(0, 1)) + 1) + '. ';
                                break;
                        }
                        panels.input.value =  panels.input.value.substring(0, cursor + linecount)  + block + panels.input.value.substring(cursor + linecount, panels.input.value.length);
                        e.preventDefault();
                        set(panels.input, cursor + linecount + block.length, 0);
                    }
                }
            });
            util.addEvent(panels.input, "mousedown", function () {
                setMode("moving");
            });

            panels.input.onpaste = handlePaste;
            panels.input.ondrop = handlePaste;
        };

        var init = function () {
            setEventHandlers();
            refreshState(true);
            saveState();
        };

        init();
    }

    // get the selection
    function get(textarea) {
        textarea.focus();

        scrollPosition = textarea.scrollTop;
        if (document.selection) {
            selection = document.selection.createRange().text;
            if (/MSIE/.test(navigator.userAgent)) { // ie
                var range = document.selection.createRange(), rangeCopy = range.duplicate();
                rangeCopy.moveToElementText(textarea);
                caretPosition = -1;
                while(rangeCopy.inRange(range)) {
                    rangeCopy.moveStart('character');
                    caretPosition ++;
                }
            } else { // opera
                caretPosition = textarea.selectionStart;
            }
        } else { // gecko & webkit
            caretPosition = textarea.selectionStart;

            selection = textarea.value.substring(caretPosition, textarea.selectionEnd);
        } 
        return selection;
    }

    // set a selection
    function set(textarea, start, len) {
        if (textarea.createTextRange){
            // quick fix to make it work on Opera 9.5
            /*if ($.browser.opera && $.browser.version >= 9.5 && len == 0) {
                return false;
            }*/
            range = textarea.createTextRange();
            range.collapse(true);
            range.moveStart('character', start); 
            range.moveEnd('character', len); 
            range.select();
        } else if (textarea.setSelectionRange ){
            textarea.setSelectionRange(start, start + len);
        }
        textarea.scrollTop = scrollPosition;
        textarea.focus();
    }

    // end of UndoManager

    // The input textarea state/contents.
    // This is used to implement undo/redo by the undo manager.
    function TextareaState(panels, isInitialState) {

        // Aliases
        var stateObj = this;
        var inputArea = panels.input;
        this.init = function () {
            if (!util.isVisible(inputArea)) {
                return;
            }
            if (!isInitialState && doc.activeElement && doc.activeElement !== inputArea) { // this happens when tabbing out of the input box
                return;
            }

            this.setInputAreaSelectionStartEnd();
            this.scrollTop = inputArea.scrollTop;
            if (!this.text && inputArea.selectionStart || inputArea.selectionStart === 0) {
                this.text = inputArea.value;
            }

        }

        // Sets the selected text in the input box after we've performed an
        // operation.
        this.setInputAreaSelection = function () {

            if (!util.isVisible(inputArea)) {
                return;
            }

            if (inputArea.selectionStart !== undefined && !uaSniffed.isOpera) {

                inputArea.focus();
                inputArea.selectionStart = stateObj.start;
                inputArea.selectionEnd = stateObj.end;
                inputArea.scrollTop = stateObj.scrollTop;
            }
            else if (doc.selection) {

                if (doc.activeElement && doc.activeElement !== inputArea) {
                    return;
                }

                inputArea.focus();
                var range = inputArea.createTextRange();
                range.moveStart("character", -inputArea.value.length);
                range.moveEnd("character", -inputArea.value.length);
                range.moveEnd("character", stateObj.end);
                range.moveStart("character", stateObj.start);
                range.select();
            }
        };

        this.setInputAreaSelectionStartEnd = function () {

            if (!panels.ieCachedRange && (inputArea.selectionStart || inputArea.selectionStart === 0)) {

                stateObj.start = inputArea.selectionStart;
                stateObj.end = inputArea.selectionEnd;
            }
            else if (doc.selection) {

                stateObj.text = util.fixEolChars(inputArea.value);

                // IE loses the selection in the textarea when buttons are
                // clicked.  On IE we cache the selection. Here, if something is cached,
                // we take it.
                var range = panels.ieCachedRange || doc.selection.createRange();

                var fixedRange = util.fixEolChars(range.text);
                var marker = "\x07";
                var markedRange = marker + fixedRange + marker;
                range.text = markedRange;
                var inputText = util.fixEolChars(inputArea.value);

                range.moveStart("character", -markedRange.length);
                range.text = fixedRange;

                stateObj.start = inputText.indexOf(marker);
                stateObj.end = inputText.lastIndexOf(marker) - marker.length;

                var len = stateObj.text.length - util.fixEolChars(inputArea.value).length;

                if (len) {
                    range.moveStart("character", -fixedRange.length);
                    while (len--) {
                        fixedRange += "\n";
                        stateObj.end += 1;
                    }
                    range.text = fixedRange;
                }

                if (panels.ieCachedRange)
                    stateObj.scrollTop = panels.ieCachedScrollTop; // this is set alongside with ieCachedRange
                
                panels.ieCachedRange = null;

                this.setInputAreaSelection();
            }
        };

        // Restore this state into the input area.
        this.restore = function () {

            if (stateObj.text != undefined && stateObj.text != inputArea.value) {
                inputArea.value = stateObj.text;
            }
            this.setInputAreaSelection();
            inputArea.scrollTop = stateObj.scrollTop;
        };

        // Gets a collection of HTML chunks from the inptut textarea.
        this.getChunks = function () {

            var chunk = new Chunks();
            chunk.before = util.fixEolChars(stateObj.text.substring(0, stateObj.start));
            chunk.startTag = "";
            chunk.selection = util.fixEolChars(stateObj.text.substring(stateObj.start, stateObj.end));
            chunk.endTag = "";
            chunk.after = util.fixEolChars(stateObj.text.substring(stateObj.end));
            chunk.scrollTop = stateObj.scrollTop;

            return chunk;
        };

        // Sets the TextareaState properties given a chunk of markdown.
        this.setChunks = function (chunk) {

            chunk.before = chunk.before + chunk.startTag;
            chunk.after = chunk.endTag + chunk.after;

            this.start = chunk.before.length;
            this.end = chunk.before.length + chunk.selection.length;
            this.text = chunk.before + chunk.selection + chunk.after;
            this.scrollTop = chunk.scrollTop;
        };
        this.init();
    };

    function PreviewManager(converter, panels, previewRefreshCallback) {

        var managerObj = this;
        var timeout;
        var elapsedTime;
        var oldInputText;
        var maxDelay = 3000;
        var startType = "delayed"; // The other legal value is "manual"

        // Adds event listeners to elements
        var setupEvents = function (inputElem, listener) {

            util.addEvent(inputElem, "input", listener);
            inputElem.onpaste = listener;
            inputElem.ondrop = listener;

            util.addEvent(inputElem, "keypress", listener);
            util.addEvent(inputElem, "keydown", listener);
        };

        var getDocScrollTop = function () {

            var result = 0;

            if (window.innerHeight) {
                result = window.pageYOffset;
            }
            else
                if (doc.documentElement && doc.documentElement.scrollTop) {
                    result = doc.documentElement.scrollTop;
                }
                else
                    if (doc.body) {
                        result = doc.body.scrollTop;
                    }

            return result;
        };

        var makePreviewHtml = function () {

            // If there is no registered preview panel
            // there is nothing to do.
            if (!panels.preview)
                return;


            var text = panels.input.value;
            if (text && text == oldInputText) {
                return; // Input text hasn't changed.
            }
            else {
                oldInputText = text;
            }

            var prevTime = new Date().getTime();

            text = converter.makeHtml(text);

            // Calculate the processing time of the HTML creation.
            // It's used as the delay time in the event listener.
            var currTime = new Date().getTime();
            elapsedTime = currTime - prevTime;

            pushPreviewHtml(text);
        };

        // setTimeout is already used.  Used as an event listener.
        var applyTimeout = function () {

            if (timeout) {
                clearTimeout(timeout);
                timeout = undefined;
            }

            if (startType !== "manual") {

                var delay = 0;

                if (startType === "delayed") {
                    delay = elapsedTime;
                }

                if (delay > maxDelay) {
                    delay = maxDelay;
                }
                timeout = setTimeout(makePreviewHtml, delay);
            }
        };

        var getScaleFactor = function (panel) {
            if (panel.scrollHeight <= panel.clientHeight) {
                return 1;
            }
            return panel.scrollTop / (panel.scrollHeight - panel.clientHeight);
        };

        var setPanelScrollTops = function () {
            if (panels.preview) {
                panels.preview.scrollTop = (panels.preview.scrollHeight - panels.preview.clientHeight) * getScaleFactor(panels.preview);
            }
        };

        this.refresh = function (requiresRefresh) {

            if (requiresRefresh) {
                oldInputText = "";
                makePreviewHtml();
            }
            else {
                applyTimeout();
            }
        };

        this.processingTime = function () {
            return elapsedTime;
        };

        var isFirstTimeFilled = true;

        // IE doesn't let you use innerHTML if the element is contained somewhere in a table
        // (which is the case for inline editing) -- in that case, detach the element, set the
        // value, and reattach. Yes, that *is* ridiculous.
        var ieSafePreviewSet = function (text) {
            var preview = panels.preview;
            var parent = preview.parentNode;
            var sibling = preview.nextSibling;
            parent.removeChild(preview);
            preview.innerHTML = text;
            if (!sibling)
                parent.appendChild(preview);
            else
                parent.insertBefore(preview, sibling);
        }

        var nonSuckyBrowserPreviewSet = function (text) {
            panels.preview.innerHTML = text;
        }

        var previewSetter;

        var previewSet = function (text) {
            if (previewSetter)
                return previewSetter(text);

            try {
                nonSuckyBrowserPreviewSet(text);
                previewSetter = nonSuckyBrowserPreviewSet;
            } catch (e) {
                previewSetter = ieSafePreviewSet;
                previewSetter(text);
            }
        };

        var pushPreviewHtml = function (text) {

            var emptyTop = position.getTop(panels.input) - getDocScrollTop();

            if (panels.preview) {
                previewSet(text);
                previewRefreshCallback();
            }

            setPanelScrollTops();

            if (isFirstTimeFilled) {
                isFirstTimeFilled = false;
                return;
            }

            var fullTop = position.getTop(panels.input) - getDocScrollTop();

            if (uaSniffed.isIE) {
                setTimeout(function () {
                    window.scrollBy(0, fullTop - emptyTop);
                }, 0);
            }
            else {
                window.scrollBy(0, fullTop - emptyTop);
            }
        };

        var init = function () {

            setupEvents(panels.input, applyTimeout);
            makePreviewHtml();

            if (panels.preview) {
                panels.preview.scrollTop = 0;
            }
        };

        init();
    };

    
    // This simulates a modal dialog box and asks for the URL when you
    // click the hyperlink or image buttons.
    //
    // text: The html for the input box.
    // defaultInputText: The default value that appears in the input box.
    // callback: The function which is executed when the prompt is dismissed, either via OK or Cancel.
    //      It receives a single argument; either the entered text (if OK was chosen) or null (if Cancel
    //      was chosen).
    ui.prompt = function (title, text, defaultInputText, callback) {

        // These variables need to be declared at this level since they are used
        // in multiple functions.
        var dialog;         // The dialog box.
        var input;         // The text box where you enter the hyperlink.


        if (defaultInputText === undefined) {
            defaultInputText = "";
        }

        // Used as a keydown event handler. Esc dismisses the prompt.
        // Key code 27 is ESC.
        var checkEscape = function (key) {
            var code = (key.charCode || key.keyCode);
            if (code === 27) {
                close(true);
            }
        };

        // Dismisses the hyperlink input box.
        // isCancel is true if we don't care about the input text.
        // isCancel is false if we are going to keep the text.
        var close = function (isCancel) {
            util.removeEvent(doc.body, "keydown", checkEscape);
            var text = input.value;

            if (isCancel) {
                text = null;
            }
            else {
                // Fixes common pasting errors.
                text = text.replace(/^http:\/\/(https?|ftp):\/\//, '$1://');
                if (!/^(?:https?|ftp):\/\//.test(text))
                    text = 'http://' + text;
            }

            $(dialog).modal('hide');
            callback(text);
            return false;
        };



        // Create the text input box form/window.
        var createDialog = function () {
            // <div class="modal" id="myModal">
            //   <div class="modal-header">
            //     <a class="close" data-dismiss="modal">×</a>
            //     <h3>Modal header</h3>
            //   </div>
            //   <div class="modal-body">
            //     <p>One fine body…</p>
            //   </div>
            //   <div class="modal-footer">
            //     <a href="#" class="btn btn-primary">Save changes</a>
            //     <a href="#" class="btn">Close</a>
            //   </div>
            // </div>

            // The main dialog box.
            dialog = doc.createElement("div");
            dialog.className = "modal hide fade";
            dialog.style.display = "none";

            if (title == '插入图片' || title == '插入视频')
            {
                dialog.className += ' aw-imageVideo-box';
            }

            // The box
            var box = doc.createElement("div");
            box.className = "modal-dialog";
            dialog.appendChild(box);

            var content = doc.createElement("div");
            content.className = "modal-content";
            box.appendChild(content);

            // The header.
            var header = doc.createElement("div");
            header.className = "modal-header";
            header.innerHTML = '<a class="close" data-dismiss="modal">×</a> <h3>'+title+'</h3>';
            content.appendChild(header);

            // The body.
            var body = doc.createElement("div");
            body.className = "modal-body";
            content.appendChild(body);

            // The footer.
            var footer = doc.createElement("div");
            footer.className = "modal-footer";
            content.appendChild(footer);

            // The dialog text.
            var question = doc.createElement("p");
            // question.innerHTML = '123';
            question.style.padding = "5px";
            body.appendChild(question);

            // The web form container for the text box and buttons.
            var form = doc.createElement("form"),
                style = form.style;
            form.onsubmit = function () { return close(false); };
            style.padding = "0";
            style.margin = "0";
            body.appendChild(form);

            // The input text box
            input = doc.createElement("input");
            input.type = "text";
            input.className = "form-control";
            input.value = defaultInputText;
            style = input.style;
            style.display = "block";
            style.width = "95%";
            style.marginLeft = style.marginRight = "auto";
            form.appendChild(input);

            // The ok button
            var okButton = doc.createElement("button");
            okButton.className = "btn btn-primary";
            // okButton.type = "button";
            okButton.onclick = function () { return close(false); };
            okButton.innerHTML = "确定";

            // The cancel button
            var cancelButton = doc.createElement("button");
            cancelButton.className = "btn btn-gray";
            // cancelButton.type = "button";
            cancelButton.onclick = function () { return close(true); };
            cancelButton.innerHTML = "取消";

            footer.appendChild(okButton);
            footer.appendChild(cancelButton);

            // Modify by kk
            if (title == '插入图片')
            {
                var tips = doc.createElement('p');
                tips.innerHTML = '如需要插入本地图片, 请用编辑器下面上传附件功能上传后再插入!';
                form.appendChild(tips);
            }
            else if (title == '插入视频')
            {
                var tips = doc.createElement('p');
                tips.innerHTML = '我们目前支持: 优酷、酷六、土豆、56、新浪播客、乐视、Youtube 与 SWF 文件!';
                form.appendChild(tips);
            }


            util.addEvent(doc.body, "keydown", checkEscape);

            doc.body.appendChild(dialog);

        };

        // Why is this in a zero-length timeout?
        // Is it working around a browser bug?
        setTimeout(function () {

            createDialog();

            var defTextLen = defaultInputText.length;
            if (input.selectionStart !== undefined) {
                input.selectionStart = 0;
                input.selectionEnd = defTextLen;
            }
            else if (input.createTextRange) {
                var range = input.createTextRange();
                range.collapse(false);
                range.moveStart("character", -defTextLen);
                range.moveEnd("character", defTextLen);
                range.select();
            }
            
            $(dialog).on('shown', function () {
                input.focus();
            })
            
            $(dialog).on('hidden', function () {
                dialog.parentNode.removeChild(dialog);
            })

            $(dialog).modal()

        }, 0);
    };

    function UIManager(panels, undoManager, previewManager, commandManager, helpOptions) {

        var inputBox = panels.input,
            buttons = {}; // buttons.undo, buttons.link, etc. The actual DOM elements.

        makeSpritedButtonRow();
        makeHelperRow();

        var keyEvent = "keydown";
        if (uaSniffed.isOpera) {
            keyEvent = "keypress";
        }

        util.addEvent(inputBox, keyEvent, function (key) {

            // Check to see if we have a button key and, if so execute the callback.
            if ((key.ctrlKey || key.metaKey) && !key.altKey && !key.shiftKey) {

                var keyCode = key.charCode || key.keyCode;
                var keyCodeStr = String.fromCharCode(keyCode).toLowerCase();

                switch (keyCodeStr) {
                    case "b":
                        doClick(buttons.bold);
                        break;
                    case "i":
                        doClick(buttons.italic);
                        break;
                    case "l":
                        doClick(buttons.link);
                        break;
                    case "h":
                        doClick(buttons.quote);
                        break;
                    case "k":
                        doClick(buttons.code);
                        break;
                    case "g":
                        doClick(buttons.image);
                        break;
                    case "o":
                        doClick(buttons.olist);
                        break;
                    case "u":
                        doClick(buttons.ulist);
                        break;
                    // case "h":
                    //     doClick(buttons.heading);
                    //     break;
                    // case "r":
                    //     doClick(buttons.hr);
                    //     break;
                    case "e":
                        doClick(buttons.video);
                        break;
                    case "y":
                        doClick(buttons.redo);
                        break;
                    case "z":
                        if (key.shiftKey) {
                            doClick(buttons.redo);
                        }
                        else {
                            doClick(buttons.undo);
                        }
                        break;
                    default:
                        return;
                }


                if (key.preventDefault) {
                    key.preventDefault();
                }

                if (window.event) {
                    window.event.returnValue = false;
                }
            }
        });

        // Auto-indent on shift-enter
        util.addEvent(inputBox, "keyup", function (key) {
            if (key.shiftKey && !key.ctrlKey && !key.metaKey) {
                var keyCode = key.charCode || key.keyCode;
                // Character 13 is Enter
                if (keyCode === 13) {
                    var fakeButton = {};
                    fakeButton.textOp = bindCommand("doAutoindent");
                    doClick(fakeButton);
                }
            }
        });

        // special handler because IE clears the context of the textbox on ESC
        if (uaSniffed.isIE) {
            util.addEvent(inputBox, "keydown", function (key) {
                var code = key.keyCode;
                if (code === 27) {
                    return false;
                }
            });
        }


        // Perform the button's action.
        function doClick(button) {

            inputBox.focus();

            if (button.textOp) {

                if (undoManager) {
                    undoManager.setCommandMode();
                }

                var state = new TextareaState(panels);

                if (!state) {
                    return;
                }

                var chunks = state.getChunks();

                // Some commands launch a "modal" prompt dialog.  Javascript
                // can't really make a modal dialog box and the WMD code
                // will continue to execute while the dialog is displayed.
                // This prevents the dialog pattern I'm used to and means
                // I can't do something like this:
                //
                // var link = CreateLinkDialog();
                // makeMarkdownLink(link);
                // 
                // Instead of this straightforward method of handling a
                // dialog I have to pass any code which would execute
                // after the dialog is dismissed (e.g. link creation)
                // in a function parameter.
                //
                // Yes this is awkward and I think it sucks, but there's
                // no real workaround.  Only the image and link code
                // create dialogs and require the function pointers.
                var fixupInputArea = function () {

                    inputBox.focus();

                    if (chunks) {
                        state.setChunks(chunks);
                    }

                    state.restore();
                    previewManager.refresh();
                };

                var noCleanup = button.textOp(chunks, fixupInputArea);

                if (!noCleanup) {
                    fixupInputArea();
                }

            }

            if (button.execute) {
                button.execute(undoManager);
            }
        };

        function setupButton(button, isEnabled) {

            if (isEnabled) {
                button.disabled = false;

                if (!button.isHelp) {
                    button.onclick = function () {
                        if (this.onmouseout) {
                            this.onmouseout();
                        }
                        doClick(this);
                        return false;
                    }
                }
            }
            else {
                button.disabled = true;
            }
        }

        function bindCommand(method) {
            if (typeof method === "string")
                method = commandManager[method];
            return function () { method.apply(commandManager, arguments); }
        }

        function makeSpritedButtonRow() {

            var buttonBar = panels.buttonBar;
            var buttonRow = document.createElement("div");
            buttonRow.id = "wmd-button-row";
            buttonRow.className = 'btn-toolbar';
            buttonRow = buttonBar.appendChild(buttonRow);

            var makeButton = function (id, title, icon, textOp, group) {
                var button = document.createElement("button");
                button.className = "btn";
                var buttonImage = document.createElement("i");
                buttonImage.className = icon;
                button.id = id;
                button.appendChild(buttonImage);
                button.title = title;
                $(button).tooltip({placement: 'bottom'})
                if (textOp)
                    button.textOp = textOp;
                setupButton(button, true);
                if (group) {
                    group.appendChild(button);
                } else {
                    buttonRow.appendChild(button);
                }
                return button;
            };
            var makeGroup = function (num) {
                var group = document.createElement("div");
                group.className = "btn-group wmd-button-group" + num;
                group.id = "wmd-button-group" + num;
                buttonRow.appendChild(group);
                return group
            }

            // Mac 键盘按键提示判断
            if (navigator.appVersion.indexOf('Mac') > -1)
            {
                var ckeys = '⌘';
            }
            else
            {
                var ckeys = 'Ctrl';
            }

            group1 = makeGroup(1);
            buttons.bold = makeButton("wmd-bold-button", "加粗 - " + ckeys + "+B", "icon icon-bold", bindCommand("doBold"), group1);
            buttons.italic = makeButton("wmd-italic-button", "斜体 - " + ckeys + "+I", "icon icon-italic", bindCommand("doItalic"), group1);
            buttons.heading = makeButton("wmd-heading-button", "标题 - " + ckeys + "+H", "icon icon-h", bindCommand("doHeading"), group1);
            
            group2 = makeGroup(2);
            buttons.olist = makeButton("wmd-olist-button", "数字列表 - " + ckeys + "+O", "icon icon-ol", bindCommand(function (chunk, postProcessing) {
                this.doList(chunk, postProcessing, true);
            }), group2);
            buttons.ulist = makeButton("wmd-ulist-button", "普通列表 - " + ckeys + "+U", "icon icon-ul", bindCommand(function (chunk, postProcessing) {
                this.doList(chunk, postProcessing, false);
            }), group2);

            group4 = makeGroup(4);
            buttons.quote = makeButton("wmd-quote-button", "引用 - " + ckeys + "+H", "icon icon-quote", bindCommand("doBlockquote"), group4);
            buttons.code = makeButton("wmd-code-button", "代码 - " + ckeys + "+K", "icon icon-code", bindCommand("doCode"), group4);

            group3 = makeGroup(3);
            buttons.image = makeButton("wmd-image-button", "图片 - " + ckeys + "+G", "icon icon-image", bindCommand(function (chunk, postProcessing) {
                return this.doLinkOrImage(chunk, postProcessing, true);
            }), group3);
            buttons.video = makeButton("wmd-video-button", "视频 - " + ckeys + "+E", "icon icon-video", bindCommand(function (chunk, postProcessing) {
                return this.doVideo(chunk, postProcessing, true)
            }), group3);
            buttons.link = makeButton("wmd-link-button", "链接 - " + ckeys + "+L", "icon icon-bind", bindCommand(function (chunk, postProcessing) {
                return this.doLinkOrImage(chunk, postProcessing, false);
            }), group3);

            //buttons.hr = makeButton("wmd-hr-button", "Horizontal Rule - Ctrl+R", "fa fa-hr-line", bindCommand("doHorizontalRule"), group3);
            
            group5 = makeGroup(5);
            buttons.undo = makeButton("wmd-undo-button", "撤销 - " + ckeys + "+Z", "icon icon-undo", null, group5);
            buttons.undo.execute = function (manager) { if (manager) manager.undo(); };

            var redoTitle = /win/.test(nav.platform.toLowerCase()) ?
                "Redo - " + ckeys + "+Y" :
                "Redo - " + ckeys + "+Shift+Z"; // mac and other non-Windows platforms

            buttons.redo = makeButton("wmd-redo-button", "重做 - " + ckeys + "+Y", "icon icon-redo", null, group5);
            buttons.redo.execute = function (manager) { if (manager) manager.redo(); };

            group6 = makeGroup(6);
            group6.className = group6.className + " pull-right";
            buttons.eye = makeButton("wmd-quote-button", "开关预览模式", "icon icon-preview", null, group6);
            buttons.eye.execute = function (manager) {
                $(this).toggleClass('hover');
 
                if ($(panels.preview).is(':visible'))
                {
                    $(panels.preview).hide();
                    $.cookie('data_editor_preview', false);
                    $(this).removeClass('active');
                }
                else
                {
                    $(panels.preview).show();
                    $.cookie('data_editor_preview', true);
                    $(this).addClass('active');
                }
            };
            buttons.help = makeButton("wmd-quote-button", "编辑器语法帮助", "icon icon-help", null, group6);
            buttons.help.execute = function (manager) {
                if ($(buttonBar).find('.wmd-helper').is(':visible'))
                {
                    $(this).removeClass('active');
                    $(buttonBar).find('.wmd-helper').hide();
                }
                else
                {
                    $(this).addClass('active');
                    $(buttonBar).find('.wmd-helper').show();
                }
            };

            if (helpOptions) {
                group7 = makeGroup(7);
                group7.className = group6.className + " pull-right";
                var helpButton = document.createElement("button");
                var helpButtonImage = document.createElement("i");
                helpButtonImage.className = "fa fa-question";
                helpButton.appendChild(helpButtonImage);
                helpButton.className = "btn";
                helpButton.id = "wmd-help-button";
                helpButton.isHelp = true;
                helpButton.title = helpOptions.title || defaultHelpHoverTitle;
                $(helpButton).tooltip({placement: 'bottom'})
                helpButton.onclick = helpOptions.handler;

                setupButton(helpButton, true);
                group6.appendChild(helpButton);
                buttons.help = helpButton;
            }

            setUndoRedoButtonStates();
        }

        function makeHelperRow()
        {
            var buttonBar = panels.buttonBar;
            // create helper
            var helperRow = document.createElement("div");
            helperRow.className = "wmd-helper hide";
            buttonBar.appendChild(helperRow);

            helperRow.innerHTML = 
                '<ul class="clearfix">'+
                    '<li class="active">标题 / 粗斜体</li>'+
                    '<li>代码片段</li>'+
                    '<li>超链接 / 图片 / 视频</li>'+
                    '<li>列表 / 引用</li>'+
                '</ul>'+
                '<div class="content">'+
                    '<div class="tab-pane active">'+
                        '<p>文章内容较多时，可以用标题分段 : </p>'+
                        '<pre>## 大标题 <br/>### 小标题</pre>'+
                        '<p>斜体 / 粗体 : </p>'+
                        '<pre>**粗体** <br/>*斜体* <br/>***粗斜体*** </pre>'+
                    '</div>'+
                    '<div class="tab-pane hide">'+
                        '<p>代码片段 : </p>'+
                        '<pre>{{{<br/>代码片段<br/>}}}'+
                        '</pre>'+
                    '</div>'+
                    '<div class="tab-pane hide">'+
                        '<p>超链接 : </p>'+
                        '<pre>[链接文字](链接地址) 例: [百度](http://www.baidu.com)</pre>'+
                        '<p>图片 : </p>'+
                        '<pre>![图片说明](图片地址) 例: ![百度logo](http://www.baidu.com/img/bdlogo.gif)</pre>'+
                        '<p>视频 : </p>'+
                        '<pre>!![视频说明](视频地址) 例: !![优酷视频](http://youku.com)</pre>'+
                    '</div>'+
                    '<div class="tab-pane hide">'+
                        '<p>有序列表 : </p>'+
                        '<pre>1. 123<br/>2. 123<br/>3. 123</pre>'+
                        '<p>无序列表 : </p>'+
                        '<pre>- 123<br/>- 123<br/>- 123<br/></pre>'+
                        '<p>引用 : ( 双回车后结束引用 )</p>'+
                        '<pre>&gt 引用内容<br/>引用内容<br/>引用内容</pre>'+
                    '</div>'+
                '</div>';

            $('#wmd-button-bar .wmd-helper ul li').click(function()
            {
                $(this).addClass('active').siblings().removeClass('active');
                $(this).parents('.wmd-helper').find('.content div').eq($(this).index()).show().siblings().hide();
            });
        }


        function setUndoRedoButtonStates() {
            if (undoManager) {
                setupButton(buttons.undo, undoManager.canUndo());
                setupButton(buttons.redo, undoManager.canRedo());
            }
        };

        this.setUndoRedoButtonStates = setUndoRedoButtonStates;

    }

    function CommandManager(pluginHooks) {
        this.hooks = pluginHooks;
    }

    var commandProto = CommandManager.prototype;

    // The markdown symbols - 4 spaces = code, > = blockquote, etc.
    commandProto.prefixes = "(?:\\s{4,}|\\s*>|\\s*-\\s+|\\s*\\d+\\.|=|\\+|-|_|\\*|#|\\s*\\[[^\n]]+\\]:)";

    // Remove markdown symbols from the chunk selection.
    commandProto.unwrap = function (chunk) {
        var txt = new re("([^\\n])\\n(?!(\\n|" + this.prefixes + "))", "g");
        chunk.selection = chunk.selection.replace(txt, "$1 $2");
    };

    commandProto.wrap = function (chunk, len) {
        this.unwrap(chunk);
        var regex = new re("(.{1," + len + "})( +|$\\n?)", "gm"),
            that = this;

        chunk.selection = chunk.selection.replace(regex, function (line, marked) {
            if (new re("^" + that.prefixes, "").test(line)) {
                return line;
            }
            return marked + "\n";
        });

        chunk.selection = chunk.selection.replace(/\s+$/, "");
    };

    commandProto.doBold = function (chunk, postProcessing) {
        return this.doBorI(chunk, postProcessing, 2, "加粗文字");
    };

    commandProto.doItalic = function (chunk, postProcessing) {
        return this.doBorI(chunk, postProcessing, 1, "斜体文字");
    };

    // chunk: The selected region that will be enclosed with */**
    // nStars: 1 for italics, 2 for bold
    // insertText: If you just click the button without highlighting text, this gets inserted
    commandProto.doBorI = function (chunk, postProcessing, nStars, insertText) {

        // Get rid of whitespace and fixup newlines.
        chunk.trimWhitespace();
        chunk.selection = chunk.selection.replace(/\n{2,}/g, "\n");

        // Look for stars before and after.  Is the chunk already marked up?
        // note that these regex matches cannot fail
        var starsBefore = /(\**$)/.exec(chunk.before)[0];
        var starsAfter = /(^\**)/.exec(chunk.after)[0];

        var prevStars = Math.min(starsBefore.length, starsAfter.length);

        // Remove stars if we have to since the button acts as a toggle.
        if ((prevStars >= nStars) && (prevStars != 2 || nStars != 1)) {
            chunk.before = chunk.before.replace(re("[*]{" + nStars + "}$", ""), "");
            chunk.after = chunk.after.replace(re("^[*]{" + nStars + "}", ""), "");
        }
        else if (!chunk.selection && starsAfter) {
            // It's not really clear why this code is necessary.  It just moves
            // some arbitrary stuff around.
            chunk.after = chunk.after.replace(/^([*_]*)/, "");
            chunk.before = chunk.before.replace(/(\s?)$/, "");
            var whitespace = re.$1;
            chunk.before = chunk.before + starsAfter + whitespace;
        }
        else {

            // In most cases, if you don't have any selected text and click the button
            // you'll get a selected, marked up region with the default text inserted.
            if (!chunk.selection && !starsAfter) {
                chunk.selection = insertText;
            }

            // Add the true markup.
            var markup = nStars <= 1 ? "*" : "**"; // shouldn't the test be = ?
            chunk.before = chunk.before + markup;
            chunk.after = markup + chunk.after;
        }

        return;
    };

    commandProto.stripLinkDefs = function (text, defsToAdd) {

        text = text.replace(/^[ ]{0,3}\[(\d+)\]:[ \t]*\n?[ \t]*<?(\S+?)>?[ \t]*\n?[ \t]*(?:(\n*)["(](.+?)[")][ \t]*)?(?:\n+|$)/gm,
            function (totalMatch, id, link, newlines, title) {
                defsToAdd[id] = totalMatch.replace(/\s*$/, "");
                if (newlines) {
                    // Strip the title and return that separately.
                    defsToAdd[id] = totalMatch.replace(/["(](.+?)[")]$/, "");
                    return newlines + title;
                }
                return "";
            });

        return text;
    };

    commandProto.addLinkDef = function (chunk, linkDef) {

        var refNumber = 0; // The current reference number
        var defsToAdd = {}; //
        // Start with a clean slate by removing all previous link definitions.
        chunk.before = this.stripLinkDefs(chunk.before, defsToAdd);
        chunk.selection = this.stripLinkDefs(chunk.selection, defsToAdd);
        chunk.after = this.stripLinkDefs(chunk.after, defsToAdd);

        var defs = "";
        var regex = /(\[)((?:\[[^\]]*\]|[^\[\]])*)(\][ ]?(?:\n[ ]*)?\[)(\d+)(\])/g;

        var addDefNumber = function (def) {
            refNumber++;
            def = def.replace(/^[ ]{0,3}\[(\d+)\]:/, "  [" + refNumber + "]:");
            defs += "\n" + def;
        };

        // note that
        // a) the recursive call to getLink cannot go infinite, because by definition
        //    of regex, inner is always a proper substring of wholeMatch, and
        // b) more than one level of nesting is neither supported by the regex
        //    nor making a lot of sense (the only use case for nesting is a linked image)
        var getLink = function (wholeMatch, before, inner, afterInner, id, end) {
            inner = inner.replace(regex, getLink);
            if (defsToAdd[id]) {
                addDefNumber(defsToAdd[id]);
                return before + inner + afterInner + refNumber + end;
            }
            return wholeMatch;
        };

        chunk.before = chunk.before.replace(regex, getLink);

        if (linkDef) {
            addDefNumber(linkDef);
        }
        else {
            chunk.selection = chunk.selection.replace(regex, getLink);
        }

        var refOut = refNumber;

        chunk.after = chunk.after.replace(regex, getLink);

        if (chunk.after) {
            chunk.after = chunk.after.replace(/\n*$/, "");
        }
        if (!chunk.after) {
            chunk.selection = chunk.selection.replace(/\n*$/, "");
        }

        chunk.after += "\n\n" + defs;

        return refOut;
    };

    // takes the line as entered into the add link/as image dialog and makes
    // sure the URL and the optinal title are "nice".
    function properlyEncoded(linkdef) {
        return linkdef.replace(/^\s*(.*?)(?:\s+"(.+)")?\s*$/, function (wholematch, link, title) {
            link = link.replace(/\?.*$/, function (querypart) {
                return querypart.replace(/\+/g, " "); // in the query string, a plus and a space are identical
            });
            link = decodeURIComponent(link); // unencode first, to prevent double encoding
            link = encodeURI(link).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
            link = link.replace(/\?.*$/, function (querypart) {
                return querypart.replace(/\+/g, "%2b"); // since we replaced plus with spaces in the query part, all pluses that now appear where originally encoded
            });
            if (title) {
                title = title.trim ? title.trim() : title.replace(/^\s*/, "").replace(/\s*$/, "");
                title = $.trim(title).replace(/"/g, "quot;").replace(/\(/g, "&#40;").replace(/\)/g, "&#41;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }
            return title ? link + ' "' + title + '"' : link;
        });
    }

    commandProto.doVideo = function (chunk, postProcessing, isVideo) {
        chunk.selection = chunk.startTag + chunk.selection + chunk.endTag;
        chunk.startTag = chunk.endTag = "";

        var that = this;
        var videoEnteredCallback = function (link) {
            if (link !== null) {

                chunk.selection = (" " + chunk.selection).replace(/([^\\](?:\\\\)*)(?=[[\]])/g, "$1\\").substr(1);
                
                chunk.startTag = isVideo ? "!![" : "[";

                chunk.endTag = "](" + link + ")";

                if (!chunk.selection) {
                    if (isVideo) {
                        chunk.selection = "请输入视频名称";
                    }
                }
            }
            postProcessing();
        };
        ui.prompt('插入视频', linkDialogText, linkDefaultText, videoEnteredCallback);
    };

    commandProto.doLinkOrImage = function (chunk, postProcessing, isImage) {

        chunk.trimWhitespace();
        chunk.findTags(/\s*!?\[/, /\][ ]?(?:\n[ ]*)?(\[.*?\])?/);
        var background;

        if (chunk.endTag.length > 1 && chunk.startTag.length > 0) {

            chunk.startTag = chunk.startTag.replace(/!?\[/, "");
            chunk.endTag = "";
            this.addLinkDef(chunk, null);

        }
        else {
            
            // We're moving start and end tag back into the selection, since (as we're in the else block) we're not
            // *removing* a link, but *adding* one, so whatever findTags() found is now back to being part of the
            // link text. linkEnteredCallback takes care of escaping any brackets.
            chunk.selection = chunk.startTag + chunk.selection + chunk.endTag;
            chunk.startTag = chunk.endTag = "";

            if (/\n\n/.test(chunk.selection)) {
                this.addLinkDef(chunk, null);
                return;
            }
            var that = this;
            // The function to be executed when you enter a link and press OK or Cancel.
            // Marks up the link and adds the ref.
            var linkEnteredCallback = function (link) {

                if (link !== null) {
                    // (                          $1
                    //     [^\\]                  anything that's not a backslash
                    //     (?:\\\\)*              an even number (this includes zero) of backslashes
                    // )
                    // (?=                        followed by
                    //     [[\]]                  an opening or closing bracket
                    // )
                    //
                    // In other words, a non-escaped bracket. These have to be escaped now to make sure they
                    // don't count as the end of the link or similar.
                    // Note that the actual bracket has to be a lookahead, because (in case of to subsequent brackets),
                    // the bracket in one match may be the "not a backslash" character in the next match, so it
                    // should not be consumed by the first match.
                    // The "prepend a space and finally remove it" steps makes sure there is a "not a backslash" at the
                    // start of the string, so this also works if the selection begins with a bracket. We cannot solve
                    // this by anchoring with ^, because in the case that the selection starts with two brackets, this
                    // would mean a zero-width match at the start. Since zero-width matches advance the string position,
                    // the first bracket could then not act as the "not a backslash" for the second.
                    chunk.selection = (" " + chunk.selection).replace(/([^\\](?:\\\\)*)(?=[[\]])/g, "$1\\").substr(1);
                    
                    var linkDef = " [999]: " + properlyEncoded(link);

                    //var num = that.addLinkDef(chunk, linkDef);
                    chunk.startTag = isImage ? "![" : "[";
                    chunk.endTag = "](" + link + ")";
                    if (!chunk.selection) {
                        if (isImage) {
                            chunk.selection = "请输入图片名称";
                        }
                        else {
                            chunk.selection = "请输入链接描述";
                        }
                    }
                }
                postProcessing();
            };


            if (isImage) {
                if (!this.hooks.insertImageDialog(linkEnteredCallback))
                    ui.prompt('插入图片', imageDialogText, imageDefaultText, linkEnteredCallback);
            }
            else {
                ui.prompt('插入链接', linkDialogText, linkDefaultText, linkEnteredCallback);
            }
            return true;
        }
    };

    // When making a list, hitting shift-enter will put your cursor on the next line
    // at the current indent level.
    commandProto.doAutoindent = function (chunk, postProcessing) {

        var commandMgr = this,
            fakeSelection = false;

        chunk.before = chunk.before.replace(/(\n|^)[ ]{0,3}([*+-]|\d+[.])[ \t]*\n$/, "\n\n");
        chunk.before = chunk.before.replace(/(\n|^)[ ]{0,3}>[ \t]*\n$/, "\n\n");
        chunk.before = chunk.before.replace(/(\n|^)[ \t]+\n$/, "\n\n");
        
        // There's no selection, end the cursor wasn't at the end of the line:
        // The user wants to split the current list item / code line / blockquote line
        // (for the latter it doesn't really matter) in two. Temporarily select the
        // (rest of the) line to achieve this.
        if (!chunk.selection && !/^[ \t]*(?:\n|$)/.test(chunk.after)) {
            chunk.after = chunk.after.replace(/^[^\n]*/, function (wholeMatch) {
                chunk.selection = wholeMatch;
                return "";
            });
            fakeSelection = true;
        }

        if (/(\n|^)[ ]{0,3}([*+-]|\d+[.])[ \t]+.*\n$/.test(chunk.before)) {
            if (commandMgr.doList) {
                commandMgr.doList(chunk);
            }
        }
        if (/(\n|^)[ ]{0,3}>[ \t]+.*\n$/.test(chunk.before)) {
            if (commandMgr.doBlockquote) {
                commandMgr.doBlockquote(chunk);
            }
        }
        if (/(\n|^)(\t|[ ]{4,}).*\n$/.test(chunk.before)) {
            if (commandMgr.doCode) {
                commandMgr.doCode(chunk);
            }
        }
        
        if (fakeSelection) {
            chunk.after = chunk.selection + chunk.after;
            chunk.selection = "";
        }
    };

    commandProto.doBlockquote = function (chunk, postProcessing) {

        chunk.selection = chunk.selection.replace(/^(\n*)([^\r]+?)(\n*)$/,
            function (totalMatch, newlinesBefore, text, newlinesAfter) {
                chunk.before += newlinesBefore;
                chunk.after = newlinesAfter + chunk.after;
                return text;
            });

        chunk.before = chunk.before.replace(/(>[ \t]*)$/,
            function (totalMatch, blankLine) {
                chunk.selection = blankLine + chunk.selection;
                return "";
            });

        chunk.selection = chunk.selection.replace(/^(\s|>)+$/, "");
        chunk.selection = chunk.selection || "引用文字";

        // The original code uses a regular expression to find out how much of the
        // text *directly before* the selection already was a blockquote:

        /*
        if (chunk.before) {
        chunk.before = chunk.before.replace(/\n?$/, "\n");
        }
        chunk.before = chunk.before.replace(/(((\n|^)(\n[ \t]*)*>(.+\n)*.*)+(\n[ \t]*)*$)/,
        function (totalMatch) {
        chunk.startTag = totalMatch;
        return "";
        });
        */

        // This comes down to:
        // Go backwards as many lines a possible, such that each line
        //  a) starts with ">", or
        //  b) is almost empty, except for whitespace, or
        //  c) is preceeded by an unbroken chain of non-empty lines
        //     leading up to a line that starts with ">" and at least one more character
        // and in addition
        //  d) at least one line fulfills a)
        //
        // Since this is essentially a backwards-moving regex, it's susceptible to
        // catstrophic backtracking and can cause the browser to hang;
        // see e.g. http://meta.stackoverflow.com/questions/9807.
        //
        // Hence we replaced this by a simple state machine that just goes through the
        // lines and checks for a), b), and c).

        var match = "",
            leftOver = "",
            line;
        if (chunk.before) {
            var lines = chunk.before.replace(/\n$/, "").split("\n");
            var inChain = false;
            for (var i = 0; i < lines.length; i++) {
                var good = false;
                line = lines[i];
                inChain = inChain && line.length > 0; // c) any non-empty line continues the chain
                if (/^>/.test(line)) {                // a)
                    good = true;
                    if (!inChain && line.length > 1)  // c) any line that starts with ">" and has at least one more character starts the chain
                        inChain = true;
                } else if (/^[ \t]*$/.test(line)) {   // b)
                    good = true;
                } else {
                    good = inChain;                   // c) the line is not empty and does not start with ">", so it matches if and only if we're in the chain
                }
                if (good) {
                    match += line + "\n";
                } else {
                    leftOver += match + line;
                    match = "\n";
                }
            }
            if (!/(^|\n)>/.test(match)) {             // d)
                leftOver += match;
                match = "";
            }
        }

        chunk.startTag = match;
        chunk.before = leftOver;

        // end of change

        if (chunk.after) {
            chunk.after = chunk.after.replace(/^\n?/, "\n");
        }

        chunk.after = chunk.after.replace(/^(((\n|^)(\n[ \t]*)*>(.+\n)*.*)+(\n[ \t]*)*)/,
            function (totalMatch) {
                chunk.endTag = totalMatch;
                return "";
            }
        );

        var replaceBlanksInTags = function (useBracket) {

            var replacement = useBracket ? "> " : "";

            if (chunk.startTag) {
                chunk.startTag = chunk.startTag.replace(/\n((>|\s)*)\n$/,
                    function (totalMatch, markdown) {
                        return "\n" + markdown.replace(/^[ ]{0,3}>?[ \t]*$/gm, replacement) + "\n";
                    });
            }
            if (chunk.endTag) {
                chunk.endTag = chunk.endTag.replace(/^\n((>|\s)*)\n/,
                    function (totalMatch, markdown) {
                        return "\n" + markdown.replace(/^[ ]{0,3}>?[ \t]*$/gm, replacement) + "\n";
                    });
            }
        };

        if (/^(?![ ]{0,3}>)/m.test(chunk.selection)) {
            this.wrap(chunk, SETTINGS.lineLength - 2);
            chunk.selection = chunk.selection.replace(/^/gm, "> ");
            replaceBlanksInTags(true);
            chunk.skipLines();
        } else {
            chunk.selection = chunk.selection.replace(/^[ ]{0,3}> ?/gm, "");
            this.unwrap(chunk);
            replaceBlanksInTags(false);

            if (!/^(\n|^)[ ]{0,3}>/.test(chunk.selection) && chunk.startTag) {
                chunk.startTag = chunk.startTag.replace(/\n{0,2}$/, "\n\n");
            }

            if (!/(\n|^)[ ]{0,3}>.*$/.test(chunk.selection) && chunk.endTag) {
                chunk.endTag = chunk.endTag.replace(/^\n{0,2}/, "\n\n");
            }
        }

        chunk.selection = this.hooks.postBlockquoteCreation(chunk.selection);

        if (!/\n/.test(chunk.selection)) {
            chunk.selection = chunk.selection.replace(/^(> *)/,
            function (wholeMatch, blanks) {
                chunk.startTag += blanks;
                return "";
            });
        }
    };

    commandProto.doCode = function (chunk, postProcessing) {

        var hasTextBefore = /\S[ ]*$/.test(chunk.before);
        var hasTextAfter = /^[ ]*\S/.test(chunk.after);

        // Use 'four space' markdown if the selection is on its own
        // line or is multiline.
        if ((!hasTextAfter && !hasTextBefore) || /\n/.test(chunk.selection)) {

            chunk.before = chunk.before.replace(/[ ]{4}$/,
                function (totalMatch) {
                    chunk.selection = totalMatch + chunk.selection;
                    return "";
                });

            var nLinesBack = 1;
            var nLinesForward = 1;

            if (/(\n|^)(\t|[ ]{4,}).*\n$/.test(chunk.before)) {
                nLinesBack = 0;
            }
            if (/^\n(\t|[ ]{4,})/.test(chunk.after)) {
                nLinesForward = 0;
            }

            chunk.skipLines(nLinesBack, nLinesForward);

            if (!chunk.selection) {
                chunk.startTag = "{{{\n";
                chunk.selection = "请输入代码";
                chunk.endTag = "\n}}}";
            }
            else {
                // if (/^[ ]{0,3}\S/m.test(chunk.selection)) {
                //     if (/\n/.test(chunk.selection))
                //         chunk.selection = chunk.selection.replace(/^/gm, "    ");
                //     else // if it's not multiline, do not select the four added spaces; this is more consistent with the doList behavior
                //         chunk.before += "    ";
                // }
                // else {
                //     chunk.selection = chunk.selection.replace(/^[ ]{4}/gm, "");
                // }
                chunk.selection = "{{{" + chunk.selection + "}}}";
            }
        }
        else {
            // Use backticks (`) to delimit the code block.

            chunk.trimWhitespace();
            chunk.findTags(/`/, /`/);

            if (!chunk.startTag && !chunk.endTag) {
                chunk.startTag = chunk.endTag = "`";
                if (!chunk.selection) {
                    chunk.selection = "enter code here";
                }
            }
            else if (chunk.endTag && !chunk.startTag) {
                chunk.before += chunk.endTag;
                chunk.endTag = "";
            }
            else {
                chunk.startTag = chunk.endTag = "";
            }
        }
    };

    commandProto.doList = function (chunk, postProcessing, isNumberedList) {

        // These are identical except at the very beginning and end.
        // Should probably use the regex extension function to make this clearer.
        var previousItemsRegex = /(\n|^)(([ ]{0,3}([*+-]|\d+[.])[ \t]+.*)(\n.+|\n{2,}([*+-].*|\d+[.])[ \t]+.*|\n{2,}[ \t]+\S.*)*)\n*$/;
        var nextItemsRegex = /^\n*(([ ]{0,3}([*+-]|\d+[.])[ \t]+.*)(\n.+|\n{2,}([*+-].*|\d+[.])[ \t]+.*|\n{2,}[ \t]+\S.*)*)\n*/;

        // The default bullet is a dash but others are possible.
        // This has nothing to do with the particular HTML bullet,
        // it's just a markdown bullet.
        var bullet = "-";

        // The number in a numbered list.
        var num = 1;

        // Get the item prefix - e.g. " 1. " for a numbered list, " - " for a bulleted list.
        var getItemPrefix = function () {
            var prefix;
            if (isNumberedList) {
                prefix = num + ". ";
                num++;
            }
            else {
                prefix = bullet + " ";
            }
            return prefix;
        };

        // Fixes the prefixes of the other list items.
        var getPrefixedItem = function (itemText) {

            // The numbering flag is unset when called by autoindent.
            if (isNumberedList === undefined) {
                isNumberedList = /^\s*\d/.test(itemText);
            }

            // Renumber/bullet the list element.
            itemText = itemText.replace(/^[ ]{0,3}([*+-]|\d+[.])\s/gm,
                function (_) {
                    return getItemPrefix();
                });

            return itemText;
        };

        chunk.findTags(/(\n|^)*[ ]{0,3}([*+-]|\d+[.])\s+/, null);

        if (chunk.before && !/\n$/.test(chunk.before) && !/^\n/.test(chunk.startTag)) {
            chunk.before += chunk.startTag;
            chunk.startTag = "";
        }

        if (chunk.startTag) {

            var hasDigits = /\d+[.]/.test(chunk.startTag);
            chunk.startTag = "";
            chunk.selection = chunk.selection.replace(/\n[ ]{4}/g, "\n");
            this.unwrap(chunk);
            chunk.skipLines();

            if (hasDigits) {
                // Have to renumber the bullet points if this is a numbered list.
                chunk.after = chunk.after.replace(nextItemsRegex, getPrefixedItem);
            }
            if (isNumberedList == hasDigits) {
                return;
            }
        }

        var nLinesUp = 1;

        chunk.before = chunk.before.replace(previousItemsRegex,
            function (itemText) {
                if (/^\s*([*+-])/.test(itemText)) {
                    bullet = re.$1;
                }
                nLinesUp = /[^\n]\n\n[^\n]/.test(itemText) ? 1 : 0;
                return getPrefixedItem(itemText);
            });

        if (!chunk.selection) {
            chunk.selection = "列表";
        }

        var prefix = getItemPrefix();

        var nLinesDown = 1;

        chunk.after = chunk.after.replace(nextItemsRegex,
            function (itemText) {
                nLinesDown = /[^\n]\n\n[^\n]/.test(itemText) ? 1 : 0;
                return getPrefixedItem(itemText);
            });

        chunk.trimWhitespace(true);
        chunk.skipLines(nLinesUp, nLinesDown, true);
        chunk.startTag = prefix;
        var spaces = prefix.replace(/./g, " ");
        this.wrap(chunk, SETTINGS.lineLength - spaces.length);
        chunk.selection = chunk.selection.replace(/\n/g, "\n" + spaces);

    };

    commandProto.doHeading = function (chunk, postProcessing) {

        // Remove leading/trailing whitespace and reduce internal spaces to single spaces.
        chunk.selection = chunk.selection.replace(/\s+/g, " ");
        chunk.selection = chunk.selection.replace(/(^\s+|\s+$)/g, "");

        // If we clicked the button with no selected text, we just
        // make a level 2 hash header around some default text.
        if (!chunk.selection) {
            chunk.startTag = "## ";
            chunk.selection = "标题";
            chunk.endTag = " ##";
            return;
        }
        else
        {
            chunk.selection = "## " + chunk.selection + " ##";
        }
    };

    commandProto.doHorizontalRule = function (chunk, postProcessing) {
        chunk.startTag = "----------\n";
        chunk.selection = "";
        chunk.skipLines(2, 1, true);
    }


})();