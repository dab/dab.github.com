/* ../../libs/bem-core/node_modules/ym/modules.js begin */
/**
 * Modules
 *
 * Copyright (c) 2013 Filatov Dmitry (dfilatov@yandex-team.ru)
 * Dual licensed under the MIT and GPL licenses:
 * http://www.opensource.org/licenses/mit-license.php
 * http://www.gnu.org/licenses/gpl.html
 *
 * @version 0.0.12
 */

(function(global) {

var undef,
    DECL_STATES = {
        NOT_RESOLVED : 'NOT_RESOLVED',
        IN_RESOLVING : 'IN_RESOLVING',
        RESOLVED     : 'RESOLVED'
    },

    /**
     * Creates a new instance of modular system
     * @returns {Object}
     */
    create = function() {
        var curOptions = {
                trackCircularDependencies : true,
                allowMultipleDeclarations : true
            },

            modulesStorage = {},
            declsToCalc = [],
            waitForNextTick = false,
            pendingRequires = [],

            /**
             * Defines module
             * @param {String} name
             * @param {String[]} [deps]
             * @param {Function} declFn
             */
            define = function(name, deps, declFn) {
                if(!declFn) {
                    declFn = deps;
                    deps = [];
                }

                var module = modulesStorage[name];
                if(module) {
                    if(!curOptions.allowMultipleDeclarations) {
                        throwMultipleDeclarationDetected(name);
                        return;
                    }
                }
                else {
                    module = modulesStorage[name] = {
                        name : name,
                        decl : undef
                    };
                }

                declsToCalc.push(module.decl = {
                    name          : name,
                    fn            : declFn,
                    state         : DECL_STATES.NOT_RESOLVED,
                    deps          : deps,
                    prevDecl      : module.decl,
                    dependOnDecls : [],
                    dependents    : [],
                    exports       : undef
                });
            },

            /**
             * Requires modules
             * @param {String[]} modules
             * @param {Function} cb
             */
            require = function(modules, cb) {
                if(!waitForNextTick) {
                    waitForNextTick = true;
                    nextTick(onNextTick);
                }

                pendingRequires.push({
                    modules : modules,
                    cb      : cb
                });
            },

            /**
             * Returns state of module
             * @param {String} name
             * @returns {String} state, possible values NOT_DEFINED, NOT_RESOLVED, IN_RESOLVING, RESOLVED
             */
            getState = function(name) {
                var module = modulesStorage[name];
                return module?
                    DECL_STATES[module.decl.state] :
                    'NOT_DEFINED';
            },

            /**
             * Returns whether the module is defined
             * @param {String} name
             * @returns {Boolean}
             */
            isDefined = function(name) {
                return !!modulesStorage[name];
            },

            /**
             * Sets options
             * @param {Object} options
             */
            setOptions = function(options) {
                for(var name in options) {
                    if(options.hasOwnProperty(name)) {
                        curOptions[name] = options[name];
                    }
                }
            },

            onNextTick = function() {
                waitForNextTick = false;
                calcDeclDeps();
                applyRequires();
            },

            calcDeclDeps = function() {
                var i = 0, decl, j, dep, dependOnDecls;
                while(decl = declsToCalc[i++]) {
                    j = 0;
                    dependOnDecls = decl.dependOnDecls;
                    while(dep = decl.deps[j++]) {
                        if(!isDefined(dep)) {
                            throwModuleNotFound(dep, decl);
                            break;
                        }
                        dependOnDecls.push(modulesStorage[dep].decl);
                    }

                    if(decl.prevDecl) {
                        dependOnDecls.push(decl.prevDecl);
                        decl.prevDecl = undef;
                    }
                }

                declsToCalc = [];
            },

            applyRequires = function() {
                var requiresToProcess = pendingRequires,
                    require, i = 0, j, dep, dependOnDecls, applyCb;

                pendingRequires = [];

                while(require = requiresToProcess[i++]) {
                    j = 0; dependOnDecls = []; applyCb = true;
                    while(dep = require.modules[j++]) {
                        if(!isDefined(dep)) {
                            throwModuleNotFound(dep);
                            applyCb = false;
                            break;
                        }

                        dependOnDecls.push(modulesStorage[dep].decl);
                    }
                    applyCb && applyRequire(dependOnDecls, require.cb);
                }
            },

            applyRequire = function(dependOnDecls, cb) {
                requireDecls(
                    dependOnDecls,
                    function(exports) {
                        cb.apply(global, exports);
                    },
                    []);
            },

            requireDecls = function(decls, cb, path) {
                var unresolvedDeclCnt = decls.length;

                if(unresolvedDeclCnt) {
                    var onDeclResolved,
                        i = 0, decl;

                    while(decl = decls[i++]) {
                        if(decl.state === DECL_STATES.RESOLVED) {
                            --unresolvedDeclCnt;
                        }
                        else {
                            if(curOptions.trackCircularDependencies && isDependenceCircular(decl, path)) {
                                throwCircularDependenceDetected(decl, path);
                            }

                            decl.state === DECL_STATES.NOT_RESOLVED && startDeclResolving(decl, path);

                            decl.state === DECL_STATES.RESOLVED? // decl resolved synchronously
                                --unresolvedDeclCnt :
                                decl.dependents.push(onDeclResolved || (onDeclResolved = function() {
                                    --unresolvedDeclCnt || onDeclsResolved(decls, cb);
                                }));
                        }
                    }
                }

                unresolvedDeclCnt || onDeclsResolved(decls, cb);
            },

            onDeclsResolved = function(decls, cb) {
                var exports = [],
                    i = 0, decl;
                while(decl = decls[i++]) {
                    exports.push(decl.exports);
                }
                cb(exports);
            },

            startDeclResolving = function(decl, path) {
                curOptions.trackCircularDependencies && (path = path.slice()).push(decl);
                decl.state = DECL_STATES.IN_RESOLVING;
                var isProvided = false;
                requireDecls(
                    decl.dependOnDecls,
                    function(depDeclsExports) {
                        decl.fn.apply(
                            {
                                name   : decl.name,
                                deps   : decl.deps,
                                global : global
                            },
                            [function(exports) {
                                isProvided?
                                    throwDeclAlreadyProvided(decl) :
                                    isProvided = true;
                                provideDecl(decl, exports);
                                return exports;
                            }].concat(depDeclsExports));
                    },
                    path);
            },

            provideDecl = function(decl, exports) {
                decl.exports = exports;
                decl.state = DECL_STATES.RESOLVED;

                var i = 0, dependent;
                while(dependent = decl.dependents[i++]) {
                    dependent(decl.exports);
                }

                decl.dependents = undef;
            };

        return {
            create     : create,
            define     : define,
            require    : require,
            getState   : getState,
            isDefined  : isDefined,
            setOptions : setOptions
        };
    },

    isDependenceCircular = function(decl, path) {
        var i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            if(decl === pathDecl) {
                return true;
            }
        }
        return false;
    },

    throwException = function(e) {
        nextTick(function() {
            throw e;
        });
    },

    throwModuleNotFound = function(name, decl) {
        throwException(Error(
            decl?
                'Module "' + decl.name + '": can\'t resolve dependence "' + name + '"' :
                'Can\'t resolve required module "' + name + '"'));
    },

    throwCircularDependenceDetected = function(decl, path) {
        var strPath = [],
            i = 0, pathDecl;
        while(pathDecl = path[i++]) {
            strPath.push(pathDecl.name);
        }
        strPath.push(decl.name);

        throwException(Error('Circular dependence detected "' + strPath.join(' -> ') + '"'));
    },

    throwDeclAlreadyProvided = function(decl) {
        throwException(Error('Declaration of module "' + decl.name + '" already provided'));
    },

    throwMultipleDeclarationDetected = function(name) {
        throwException(Error('Multiple declaration of module "' + name + '" detected'));
    },

    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof process === 'object' && process.nextTick) { // nodejs
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        if(global.setImmediate) { // ie10
            return function(fn) {
                enqueueFn(fn) && global.setImmediate(callFns);
            };
        }

        if(global.postMessage && !global.opera) { // modern browsers
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__modules' + (+new Date()),
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var head = doc.getElementsByTagName('head')[0],
                createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                    };
                    head.appendChild(script);
                };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })();

if(typeof exports === 'object') {
    module.exports = create();
}
else {
    global.modules = create();
}

})(this);

/* ../../libs/bem-core/node_modules/ym/modules.js end */
;
/* ../../libs/bem-core/common.blocks/i-bem/i-bem.vanilla.js begin */
/**
 * @module i-bem
 */

modules.define(
    'i-bem',
    ['inherit', 'identify', 'next-tick', 'objects', 'functions', 'events', 'events__channels'],
    function(provide, inherit, identify, nextTick, objects, functions, events, channels) {

var undef,
/**
 * Storage for block init functions
 * @private
 * @type Array
 */
    initFns = [],

/**
 * Storage for block declarations (hash by block name)
 * @private
 * @type Object
 */
    blocks = {};

/**
 * Builds the name of the handler method for setting a modifier
 * @private
 * @param {String} prefix
 * @param {String} modName Modifier name
 * @param {String} modVal Modifier value
 * @param {String} [elemName] Element name
 * @returns {String}
 */
function buildModFnName(prefix, modName, modVal, elemName) {
    return '__' + prefix +
        (elemName? '__elem_' + elemName : '') +
       '__mod' +
       (modName? '_' + modName : '') +
       (modVal? '_' + modVal : '');
}

/**
 * Transforms a hash of modifier handlers to methods
 * @static
 * @private
 * @param {String} prefix
 * @param {Object} modFns
 * @param {Object} props
 * @param {String} [elemName]
 */
function modFnsToProps(prefix, modFns, props, elemName) {
    if(functions.isFunction(modFns)) {
        props[buildModFnName(prefix, '*', '*', elemName)] = modFns;
    } else {
        var modName, modVal, modFn;
        for(modName in modFns) {
            if(modFns.hasOwnProperty(modName)) {
                modFn = modFns[modName];
                if(functions.isFunction(modFn)) {
                    props[buildModFnName(prefix, modName, modName === 'js'? 'inited' : '*', elemName)] = modFn;
                    /** @deprecated: above code has fallback, replace
                     *  modName === 'js'? 'inited': '*'
                     *  with
                     *  '*'
                     *  in next version
                     */
                } else {
                    for(modVal in modFn) {
                        if(modFn.hasOwnProperty(modVal)) {
                            props[buildModFnName(prefix, modName, modVal, elemName)] = modFn[modVal];
                        }
                    }
                }
            }
        }
    }
}

function buildCheckMod(modName, modVal) {
    return modVal?
        Array.isArray(modVal)?
            function(block) {
                var i = 0, len = modVal.length;
                while(i < len)
                    if(block.hasMod(modName, modVal[i++]))
                        return true;
                return false;
            } :
            function(block) {
                return block.hasMod(modName, modVal);
            } :
        function(block) {
            return block.hasMod(modName);
        };
}

function convertModHandlersToMethods(props) {
    if(props.beforeSetMod) {
        modFnsToProps('before', props.beforeSetMod, props);
        delete props.beforeSetMod;
    }

    if(props.onSetMod) {
        modFnsToProps('after', props.onSetMod, props);
        delete props.onSetMod;
    }

    var elemName;
    if(props.beforeElemSetMod) {
        for(elemName in props.beforeElemSetMod) {
            if(props.beforeElemSetMod.hasOwnProperty(elemName)) {
                modFnsToProps('before', props.beforeElemSetMod[elemName], props, elemName);
            }
        }
        delete props.beforeElemSetMod;
    }

    if(props.onElemSetMod) {
        for(elemName in props.onElemSetMod) {
            if(props.onElemSetMod.hasOwnProperty(elemName)) {
                modFnsToProps('after', props.onElemSetMod[elemName], props, elemName);
            }
        }
        delete props.onElemSetMod;
    }
}

var BEM = inherit(events.Emitter, /** @lends BEM.prototype */ {
    /**
     * @class Base block for creating BEM blocks
     * @constructs
     * @private
     * @param {Object} mods Block modifiers
     * @param {Object} params Block parameters
     * @param {Boolean} [initImmediately=true]
     */
    __constructor : function(mods, params, initImmediately) {
        /**
         * Cache of block modifiers
         * @private
         * @type Object
         */
        this._modCache = mods || {};

        /**
         * Current modifiers in the stack
         * @private
         * @type Object
         */
        this._processingMods = {};

        /**
         * The block's parameters, taking into account the defaults
         * @protected
         * @type Object
         */
        this.params = objects.extend(this.getDefaultParams(), params);

        initImmediately !== false?
            this._init() :
            initFns.push(this._init, this);
    },

    /**
     * Initializes the block
     * @private
     */
    _init : function() {
        return this
            .setMod('js', 'inited')
            .emit('init');
    },

    /**
     * Executes the block's event handlers and live event handlers
     * @protected
     * @param {String} e Event name
     * @param {Object} [data] Additional information
     * @returns {BEM}
     */
    emit : function(e, data) {
        this
            .__base(e = this._buildEvent(e), data)
            .hasMod('js', 'inited') &&
                this.__self.emit(e, data);

        return this;
    },

    /** @deprecated use emit */
    trigger : function() {
        return this.emit.apply(this, arguments);
    },

    _buildEvent : function(e) {
        typeof e === 'string'?
            e = new events.Event(e, this) :
            e.target || (e.target = this);

        return e;
    },

    /**
     * Checks whether a block or nested element has a modifier
     * @protected
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {Boolean}
     */
    hasMod : function(elem, modName, modVal) {
        var len = arguments.length,
            invert = false;

        if(len === 1) {
            modVal = '';
            modName = elem;
            elem = undef;
            invert = true;
        } else if(len === 2) {
            if(typeof elem === 'string') {
                modVal = modName;
                modName = elem;
                elem = undef;
            } else {
                modVal = '';
                invert = true;
            }
        }

        var res = this.getMod(elem, modName) === modVal;
        return invert? !res : res;
    },

    /**
     * Returns the value of the modifier of the block/nested element
     * @protected
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @returns {String} Modifier value
     */
    getMod : function(elem, modName) {
        var type = typeof elem;
        if(type === 'string' || type === 'undefined') { // elem either omitted or undefined
            modName = elem || modName;
            var modCache = this._modCache;
            return modName in modCache?
                modCache[modName] || '' :
                modCache[modName] = this._extractModVal(modName);
        }

        return this._getElemMod(modName, elem);
    },

    /**
     * Returns the value of the modifier of the nested element
     * @private
     * @param {String} modName Modifier name
     * @param {Object} elem Nested element
     * @param {Object} [elem] Nested element name
     * @returns {String} Modifier value
     */
    _getElemMod : function(modName, elem, elemName) {
        return this._extractModVal(modName, elem, elemName);
    },

    /**
     * Returns values of modifiers of the block/nested element
     * @protected
     * @param {Object} [elem] Nested element
     * @param {String} [modName1, ..., modNameN] Modifier names
     * @returns {Object} Hash of modifier values
     */
    getMods : function(elem) {
        var hasElem = elem && typeof elem !== 'string',
            modNames = [].slice.call(arguments, hasElem? 1 : 0),
            res = this._extractMods(modNames, hasElem? elem : undef);

        if(!hasElem) { // caching
            modNames.length?
                modNames.forEach(function(name) {
                    this._modCache[name] = res[name];
                }, this) :
                this._modCache = res;
        }

        return res;
    },

    /**
     * Sets the modifier for a block/nested element
     * @protected
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @returns {BEM}
     */
    setMod : function(elem, modName, modVal) {
        if(typeof modVal === 'undefined') {
            if(typeof elem === 'string') { // if no elem
                modVal = typeof modName === 'undefined'?
                    true :  // e.g. setMod('focused')
                    modName; // e.g. setMod('js', 'inited')
                modName = elem;
                elem = undef;
            } else { // if elem
                modVal = true; // e.g. setMod(elem, 'focused')
            }
        }

        if(!elem || elem[0]) {
            modVal === false && (modVal = '');

            var modId = (elem && elem[0]? identify(elem[0]) : '') + '_' + modName;

            if(this._processingMods[modId])
                return this;

            var elemName,
                curModVal = elem?
                    this._getElemMod(modName, elem, elemName = this.__self._extractElemNameFrom(elem)) :
                    this.getMod(modName);

            if(curModVal === modVal)
                return this;

            this._processingMods[modId] = true;

            var needSetMod = true,
                modFnParams = [modName, modVal, curModVal];

            elem && modFnParams.unshift(elem);

            var modVars = [['*', '*'], [modName, '*'], [modName, modVal]],
                prefixes = ['before', 'after'],
                i = 0, prefix, j, modVar;

            while(prefix = prefixes[i++]) {
                j = 0;
                while(modVar = modVars[j++]) {
                    if(this._callModFn(prefix, elemName, modVar[0], modVar[1], modFnParams) === false) {
                        needSetMod = false;
                        break;
                    }
                }

                if(!needSetMod) break;

                if(prefix === 'before') {
                    this._onSetMod(modName, modVal, curModVal, elem, elemName);
                    elem || (this._modCache[modName] = modVal); // cache only block mods
                }
            }

            this._processingMods[modId] = null;
        }

        return this;
    },

    /**
     * Function after successfully changing the modifier of the block/nested element
     * @protected
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {String} oldModVal Old modifier value
     * @param {Object} [elem] Nested element
     * @param {String} [elemName] Element name
     */
    _onSetMod : function(modName, modVal, oldModVal, elem, elemName) {},

    /**
     * Sets a modifier for a block/nested element, depending on conditions.
     * If the condition parameter is passed: when true, modVal1 is set; when false, modVal2 is set.
     * If the condition parameter is not passed: modVal1 is set if modVal2 was set, or vice versa.
     * @protected
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} modVal1 First modifier value
     * @param {String} [modVal2] Second modifier value
     * @param {Boolean} [condition] Condition
     * @returns {BEM}
     */
    toggleMod : function(elem, modName, modVal1, modVal2, condition) {
        if(typeof elem === 'string') { // if this is a block
            condition = modVal2;
            modVal2 = modVal1;
            modVal1 = modName;
            modName = elem;
            elem = undef;
        }

        if(typeof modVal1 === 'undefined') { // boolean mod
            modVal1 = true;
        }

        if(typeof modVal2 === 'undefined') {
            modVal2 = '';
        } else if(typeof modVal2 === 'boolean') {
            condition = modVal2;
            modVal2 = '';
        }

        var modVal = this.getMod(elem, modName);
        (modVal === modVal1 || modVal === modVal2) &&
            this.setMod(
                elem,
                modName,
                typeof condition === 'boolean'?
                    (condition? modVal1 : modVal2) :
                    this.hasMod(elem, modName, modVal1)? modVal2 : modVal1);

        return this;
    },

    /**
     * Removes a modifier from a block/nested element
     * @protected
     * @param {Object} [elem] Nested element
     * @param {String} modName Modifier name
     * @returns {BEM}
     */
    delMod : function(elem, modName) {
        if(!modName) {
            modName = elem;
            elem = undef;
        }

        return this.setMod(elem, modName, '');
    },

    /**
     * Executes handlers for setting modifiers
     * @private
     * @param {String} prefix
     * @param {String} elemName Element name
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {Array} modFnParams Handler parameters
     */
    _callModFn : function(prefix, elemName, modName, modVal, modFnParams) {
        var modFnName = buildModFnName(prefix, modName, modVal, elemName);
        return this[modFnName]?
           this[modFnName].apply(this, modFnParams) :
           undef;
    },

    /**
     * Retrieves the value of the modifier
     * @private
     * @param {String} modName Modifier name
     * @param {Object} [elem] Element
     * @returns {String} Modifier value
     */
    _extractModVal : function(modName, elem) {
        return '';
    },

    /**
     * Retrieves name/value for a list of modifiers
     * @private
     * @param {Array} modNames Names of modifiers
     * @param {Object} [elem] Element
     * @returns {Object} Hash of modifier values by name
     */
    _extractMods : function(modNames, elem) {
        return {};
    },

    /**
     * Returns a block's default parameters
     * @returns {Object}
     */
    getDefaultParams : function() {
        return {};
    },

    /**
     * Deletes a block
     * @private
     */
    _destruct : function() {
        this.delMod('js');
    },

    /**
     * Executes given callback on next turn evenloop in block's context
     * @param {Function} fn callback
     * @returns {this}
     */
    nextTick : function(fn) {
        var _this = this;
        nextTick(function() {
            _this.hasMod('js', 'inited') && fn.call(_this);
        });
        return this;
    },

    /** @deprecated use onSetMod js '' */
    destruct : function() {},

    /** @deprecated use module "next-tick" instead */
    afterCurrentEvent : function(fn, ctx) {
        this.__self.afterCurrentEvent(this.changeThis(fn, ctx));
    },

    /** @deprecated use module "events__channels" instead */
    channel : function() {
        return this.__self.channel.apply(null, arguments);
    },

    /** @deprecated use native bind */
    changeThis : function(fn, ctx) {
        return fn.bind(ctx || this);
    }
}, /** @lends BEM */{

    _name : 'i-bem',

    /**
     * Storage for block declarations (hash by block name)
     * @static
     * @protected
     * @type Object
     */
    blocks : blocks,

    /**
     * Declares blocks and creates a block class
     * @static
     * @protected
     * @param {String|Object} decl Block name (simple syntax) or description
     * @param {String} decl.block|decl.name Block name
     * @param {String} [decl.baseBlock] Name of the parent block
     * @param {Array} [decl.baseMix] Mixed block names
     * @param {String} [decl.modName] Modifier name
     * @param {String|Array} [decl.modVal] Modifier value
     * @param {Object} [props] Methods
     * @param {Object} [staticProps] Static methods
     */
    decl : function(decl, props, staticProps) {
        typeof decl === 'string' && (decl = { block : decl });

        if(decl.baseBlock && !blocks[decl.baseBlock])
            throw('baseBlock "' + decl.baseBlock + '" for "' + decl.block + '" is undefined');

        convertModHandlersToMethods(props || (props = {}));

        var baseBlock = blocks[decl.baseBlock || decl.block] || this;

        if(decl.modName) {
            var checkMod = buildCheckMod(decl.modName, decl.modVal);
            objects.each(props, function(prop, name) {
                functions.isFunction(prop) &&
                    (props[name] = function() {
                        var method;
                        if(checkMod(this)) {
                            method = prop;
                        } else {
                            var baseMethod = baseBlock.prototype[name];
                            baseMethod && baseMethod !== prop &&
                                (method = this.__base);
                        }
                        return method?
                            method.apply(this, arguments) :
                            undef;
                    });
            });
        }

        if(staticProps && typeof staticProps.live === 'boolean') {
            var live = staticProps.live;
            staticProps.live = function() {
                return live;
            };
        }

        var block, baseBlocks = baseBlock;
        if(decl.baseMix) {
            baseBlocks = [baseBlocks];
            decl.baseMix.forEach(function(mixedBlock) {
                if(!blocks[mixedBlock]) {
                    throw('mix block "' + mixedBlock + '" for "' + decl.block + '" is undefined');
                }
                baseBlocks.push(blocks[mixedBlock]);
            });
        }

        decl.block === baseBlock._name?
            // makes a new "live" if the old one was already executed
            (block = inherit.self(baseBlocks, props, staticProps))._processLive(true) :
            (block = blocks[decl.block] = inherit(baseBlocks, props, staticProps))._name = decl.block;

        return block;
    },

    declMix : function(block, props, staticProps) {
        convertModHandlersToMethods(props || (props = {}));
        return blocks[block] = inherit(props, staticProps);
    },

    /**
     * Processes a block's live properties
     * @private
     * @param {Boolean} [heedLive=false] Whether to take into account that the block already processed its live properties
     * @returns {Boolean} Whether the block is a live block
     */
    _processLive : function(heedLive) {
        return false;
    },

    /**
     * Factory method for creating an instance of the block named
     * @static
     * @param {String|Object} block Block name or description
     * @param {Object} [params] Block parameters
     * @returns {BEM}
     */
    create : function(block, params) {
        typeof block === 'string' && (block = { block : block });

        return new blocks[block.block](block.mods, params);
    },

    /**
     * Returns the name of the current block
     * @static
     * @protected
     * @returns {String}
     */
    getName : function() {
        return this._name;
    },

    /**
     * Retrieves the name of an element nested in a block
     * @static
     * @private
     * @param {Object} elem Nested element
     * @returns {String|undef}
     */
    _extractElemNameFrom : function(elem) {},

    /**
     * Executes the block init functions
     * @private
     */
    _runInitFns : function() {
        if(initFns.length) {
            var fns = initFns,
                fn, i = 0;

            initFns = [];
            while(fn = fns[i]) {
                fn.call(fns[i + 1]);
                i += 2;
            }
        }
    },

    /** @deprecated use native bind */
    changeThis : function(fn, ctx) {
        return fn.bind(ctx || this);
    },

    /** @deprecated use module "events__channels" instead */
    channel : function() {
        return channels.apply(null, arguments);
    },

    /** @deprecated use module "next-tick" instead */
    afterCurrentEvent : function(fn, ctx) {
        nextTick(ctx? fn.bind(ctx) : fn);
    }
});

provide(BEM);

});
/* ../../libs/bem-core/common.blocks/i-bem/i-bem.vanilla.js end */
;
/* ../../libs/bem-core/common.blocks/inherit/inherit.vanilla.js begin */
/**
 * @module inherit
 * @version 2.1.0
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 */

modules.define('inherit', function(provide) {

var hasIntrospection = (function(){'_';}).toString().indexOf('_') > -1,
    emptyBase = function() {},
    objCreate = Object.create || function(ptp) {
        var inheritance = function() {};
        inheritance.prototype = ptp;
        return new inheritance();
    },
    objKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            obj.hasOwnProperty(i) && res.push(i);
        }
        return res;
    },
    extend = function(o1, o2) {
        for(var i in o2) {
            o2.hasOwnProperty(i) && (o1[i] = o2[i]);
        }

        return o1;
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    isFunction = function(obj) {
        return toStr.call(obj) === '[object Function]';
    },
    noOp = function() {},
    needCheckProps = true,
    testPropObj = { toString : '' };

for(var i in testPropObj) { // fucking ie hasn't toString, valueOf in for
    testPropObj.hasOwnProperty(i) && (needCheckProps = false);
}

var specProps = needCheckProps? ['toString', 'valueOf'] : null;

function getPropList(obj) {
    var res = objKeys(obj);
    if(needCheckProps) {
        var specProp, i = 0;
        while(specProp = specProps[i++]) {
            obj.hasOwnProperty(specProp) && res.push(specProp);
        }
    }

    return res;
}

function override(base, res, add) {
    var addList = getPropList(add),
        j = 0, len = addList.length,
        name, prop;
    while(j < len) {
        if((name = addList[j++]) === '__self') {
            continue;
        }
        prop = add[name];
        if(isFunction(prop) &&
                (!hasIntrospection || prop.toString().indexOf('.__base') > -1)) {
            res[name] = (function(name, prop) {
                var baseMethod = base[name] || noOp;
                return function() {
                    var baseSaved = this.__base;
                    this.__base = baseMethod;
                    var res = prop.apply(this, arguments);
                    this.__base = baseSaved;
                    return res;
                };
            })(name, prop);
        } else {
            res[name] = prop;
        }
    }
}

function applyMixins(mixins, res) {
    var i = 1, mixin;
    while(mixin = mixins[i++]) {
        res?
            isFunction(mixin)?
                inherit.self(res, mixin.prototype, mixin) :
                inherit.self(res, mixin) :
            res = isFunction(mixin)?
                inherit(mixins[0], mixin.prototype, mixin) :
                inherit(mixins[0], mixin);
    }
    return res || mixins[0];
}

var inherit = function() {
    var args = arguments,
        withMixins = isArray(args[0]),
        hasBase = withMixins || isFunction(args[0]),
        base = hasBase? withMixins? applyMixins(args[0]) : args[0] : emptyBase,
        props = args[hasBase? 1 : 0] || {},
        staticProps = args[hasBase? 2 : 1],
        res = props.__constructor || (hasBase && base.prototype.__constructor)?
            function() {
                return this.__constructor.apply(this, arguments);
            } :
            function() {};

    if(!hasBase) {
        res.prototype = props;
        res.prototype.__self = res.prototype.constructor = res;
        return extend(res, staticProps);
    }

    extend(res, base);

    var basePtp = base.prototype,
        resPtp = res.prototype = objCreate(basePtp);

    resPtp.__self = resPtp.constructor = res;

    props && override(basePtp, resPtp, props);
    staticProps && override(base, res, staticProps);

    return res;
};

inherit.self = function() {
    var args = arguments,
        withMixins = isArray(args[0]),
        base = withMixins? applyMixins(args[0], args[0][0]) : args[0],
        props = args[1],
        staticProps = args[2],
        basePtp = base.prototype;

    props && override(basePtp, basePtp, props);
    staticProps && override(base, base, staticProps);
    
    return base;
};

provide(inherit);

});
/* ../../libs/bem-core/common.blocks/inherit/inherit.vanilla.js end */
;
/* ../../libs/bem-core/common.blocks/identify/identify.vanilla.js begin */
/**
 * @module identify
 * @version 1.0.0
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 */

modules.define('identify', function(provide) {

var counter = 0,
    expando = '__' + (+new Date),
    get = function() {
        return 'uniq' + (++counter);
    };

/**
 * Makes unique ID
 * @param {Object} obj Object that needs to be identified
 * @param {Boolean} [onlyGet=false] Return a unique value only if it had already been assigned before
 * @returns {String} ID
 */
provide(function(obj, onlyGet) {
    if(!obj) {
        return get();
    }

    var key = 'uniqueID' in obj? 'uniqueID' : expando; // Use when possible. native uniqueID for elements in IE

    return onlyGet || key in obj?
        obj[key] :
        obj[key] = get();
});

});
/* ../../libs/bem-core/common.blocks/identify/identify.vanilla.js end */
;
/* ../../libs/bem-core/common.blocks/next-tick/next-tick.vanilla.js begin */
/**
 * @module next-tick
 * @version 1.0.1
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 */

modules.define('next-tick', function(provide) {

var global = this.global,
    fns = [],
    enqueueFn = function(fn) {
        return fns.push(fn) === 1;
    },
    callFns = function() {
        var fnsToCall = fns, i = 0, len = fns.length;
        fns = [];
        while(i < len) {
            fnsToCall[i++]();
        }
    };

    /* global process */
    if(typeof process === 'object' && process.nextTick) { // nodejs
        return provide(function(fn) {
            enqueueFn(fn) && process.nextTick(callFns);
        });
    }

    if(global.setImmediate) { // ie10
        return provide(function(fn) {
            enqueueFn(fn) && global.setImmediate(callFns);
        });
    }

    if(global.postMessage) { // modern browsers
        var isPostMessageAsync = true;
        if(global.attachEvent) {
            var checkAsync = function() {
                    isPostMessageAsync = false;
                };
            global.attachEvent('onmessage', checkAsync);
            global.postMessage('__checkAsync', '*');
            global.detachEvent('onmessage', checkAsync);
        }

        if(isPostMessageAsync) {
            var msg = '__nextTick' + (+new Date),
                onMessage = function(e) {
                    if(e.data === msg) {
                        e.stopPropagation && e.stopPropagation();
                        callFns();
                    }
                };

            global.addEventListener?
                global.addEventListener('message', onMessage, true) :
                global.attachEvent('onmessage', onMessage);

            return provide(function(fn) {
                enqueueFn(fn) && global.postMessage(msg, '*');
            });
        }
    }

    var doc = global.document;
    if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
        var head = doc.getElementsByTagName('head')[0],
            createScript = function() {
                var script = doc.createElement('script');
                script.onreadystatechange = function() {
                    script.parentNode.removeChild(script);
                    script = script.onreadystatechange = null;
                    callFns();
                };
                head.appendChild(script);
            };

        return provide(function(fn) {
            enqueueFn(fn) && createScript();
        });
    }

    provide(function(fn) { // old browsers
        enqueueFn(fn) && global.setTimeout(callFns, 0);
    });
});

/* ../../libs/bem-core/common.blocks/next-tick/next-tick.vanilla.js end */
;
/* ../../libs/bem-core/common.blocks/objects/objects.vanilla.js begin */
/**
 * @module objects
 */

modules.define('objects', function(provide) {

var hasOwnProp = Object.prototype.hasOwnProperty;

provide({
    /**
     * Extends a given target by
     * @param {Object} target object to extend
     * @param {...Object} source
     * @returns {Object}
     */
    extend : function(target, source) {
        typeof target !== 'object' && (target = {});

        for(var i = 1, len = arguments.length; i < len; i++) {
            var obj = arguments[i];
            if(obj) {
                for(var key in obj) {
                    hasOwnProp.call(obj, key) && (target[key] = obj[key]);
                }
            }
        }

        return target;
    },

    /**
     * Check whether a given object is empty (contains no enumerable properties)
     * @param {Object} obj
     * @returns {Boolean}
     */
    isEmpty : function(obj) {
        for(var key in obj) {
            if(hasOwnProp.call(obj, key)) {
                return false;
            }
        }

        return true;
    },

    /**
     * Generic iterator function over object
     * @param {Object} obj object to iterate
     * @param {Function} fn callback
     * @param {Object} [ctx] callbacks's context
     */
    each : function(obj, fn, ctx) {
        for(var key in obj) {
            if(hasOwnProp.call(obj, key)) {
                ctx? fn.call(ctx, obj[key], key) : fn(obj[key], key);
            }
        }
    }
});

});
/* ../../libs/bem-core/common.blocks/objects/objects.vanilla.js end */
;
/* ../../libs/bem-core/common.blocks/functions/functions.vanilla.js begin */
/**
 * @module functions
 */

modules.define('functions', function(provide) {

var toStr = Object.prototype.toString;

provide({
    /**
     * Checks whether a given object is function
     * @param {*} obj
     * @returns {Boolean}
     */
    isFunction : function(obj) {
        return toStr.call(obj) === '[object Function]';
    },

    /**
     * @type {Function}
     */
    noop : function() {}
});

});
/* ../../libs/bem-core/common.blocks/functions/functions.vanilla.js end */
;
/* ../../libs/bem-core/common.blocks/events/events.vanilla.js begin */
/**
 * @module events
 * @version 1.0.4
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 */

modules.define(
    'events',
    ['identify', 'inherit', 'functions'],
    function(provide, identify, inherit, functions) {

var undef,
    storageExpando = '__' + (+new Date) + 'storage',
    getFnId = function(fn, ctx) {
        return identify(fn) + (ctx? identify(ctx) : '');
    },

    /**
     * @class Event
     * @alias events:Event
     */
    Event = inherit(/** @lends Event.prototype */{
        __constructor : function(type, target) {
            this.type = type;
            this.target = target;
            this.result = undef;
            this.data = undef;

            this._isDefaultPrevented = false;
            this._isPropagationStopped = false;
        },

        preventDefault : function() {
            this._isDefaultPrevented = true;
        },

        isDefaultPrevented : function() {
            return this._isDefaultPrevented;
        },

        stopPropagation : function() {
            this._isPropagationStopped = true;
        },

        isPropagationStopped : function() {
            return this._isPropagationStopped;
        }
    }),

    EmitterProps = {
        /**
         * Adds an event handler
         * @param {String} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @param {Object} [ctx] Handler context
         * @returns {this}
         */
        on : function(e, data, fn, ctx, _special) {
            if(typeof e === 'string') {
                if(functions.isFunction(data)) {
                    ctx = fn;
                    fn = data;
                    data = undef;
                }

                var id = getFnId(fn, ctx),
                    storage = this[storageExpando] || (this[storageExpando] = {}),
                    eventTypes = e.split(' '), eventType,
                    i = 0, list, item,
                    eventStorage;

                while(eventType = eventTypes[i++]) {
                    eventStorage = storage[eventType] || (storage[eventType] = { ids : {}, list : {} });
                    if(!(id in eventStorage.ids)) {
                        list = eventStorage.list;
                        item = { fn : fn, data : data, ctx : ctx, special : _special };
                        if(list.last) {
                            list.last.next = item;
                            item.prev = list.last;
                        } else {
                            list.first = item;
                        }
                        eventStorage.ids[id] = list.last = item;
                    }
                }
            } else {
                for(var key in e) {
                    e.hasOwnProperty(key) && this.on(key, e[key], data, _special);
                }
            }

            return this;
        },

        /**
         * Adds a one time handler for the event.
         * Handler is executed only the next time the event is fired, after which it is removed.
         * @param {String} e Event type
         * @param {Object} [data] Additional data that the handler gets as e.data
         * @param {Function} fn Handler
         * @param {Object} [ctx] Handler context
         * @returns {this}
         */
        once : function(e, data, fn, ctx) {
            return this.on(e, data, fn, ctx, { once : true });
        },

        /**
         * Removes event handler or handlers
         * @param {String} [e] Event type
         * @param {Function} [fn] Handler
         * @param {Object} [ctx] Handler context
         * @returns {this}
         */
        un : function(e, fn, ctx) {
            if(typeof e === 'string' || typeof e === 'undefined') {
                var storage = this[storageExpando];
                if(storage) {
                    if(e) { // if event type was passed
                        var eventTypes = e.split(' '),
                            i = 0, eventStorage;
                        while(e = eventTypes[i++]) {
                            if(eventStorage = storage[e]) {
                                if(fn) {  // if specific handler was passed
                                    var id = getFnId(fn, ctx),
                                        ids = eventStorage.ids;
                                    if(id in ids) {
                                        var list = eventStorage.list,
                                            item = ids[id],
                                            prev = item.prev,
                                            next = item.next;

                                        if(prev) {
                                            prev.next = next;
                                        } else if(item === list.first) {
                                            list.first = next;
                                        }

                                        if(next) {
                                            next.prev = prev;
                                        } else if(item === list.last) {
                                            list.last = prev;
                                        }

                                        delete ids[id];
                                    }
                                } else {
                                    delete this[storageExpando][e];
                                }
                            }
                        }
                    } else {
                        delete this[storageExpando];
                    }
                }
            } else {
                for(var key in e) {
                    e.hasOwnProperty(key) && this.un(key, e[key], fn);
                }
            }

            return this;
        },

        /**
         * Fires event handlers
         * @param {String|Event} e Event
         * @param {Object} [data] Additional data
         * @returns {this}
         */
        emit : function(e, data) {
            var storage = this[storageExpando],
                eventInstantiated = false;

            if(storage) {
                var eventTypes = [typeof e === 'string'? e : e.type, '*'],
                    i = 0, eventType, eventStorage;
                while(eventType = eventTypes[i++]) {
                    if(eventStorage = storage[eventType]) {
                        var item = eventStorage.list.first,
                            lastItem = eventStorage.list.last,
                            res;
                        while(item) {
                            if(!eventInstantiated) { // instantiate Event only on demand
                                eventInstantiated = true;
                                typeof e === 'string' && (e = new Event(e));
                                e.target || (e.target = this);
                            }

                            e.data = item.data;
                            res = item.fn.apply(item.ctx || this, arguments);
                            if(typeof res !== 'undefined') {
                                e.result = res;
                                if(res === false) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }
                            }

                            item.special && item.special.once &&
                                this.un(e.type, item.fn, item.ctx);

                            if(item === lastItem) {
                                break;
                            }

                            item = item.next;
                        }
                    }
                }
            }

            return this;
        }
    };

/** @deprecated use emit */
EmitterProps.trigger = EmitterProps.emit;

/** @deprecated use once */
EmitterProps.onFirst = EmitterProps.once;

/**
 * @class Emitter
 * @alias events:Emitter
 */
var Emitter = inherit(
        /** @lends Emitter.prototype */
        EmitterProps,
        /** @lends Emitter */
        EmitterProps);

provide({
    Emitter : Emitter,
    Event : Event
});

});
/* ../../libs/bem-core/common.blocks/events/events.vanilla.js end */
;
/* ../../libs/bem-core/common.blocks/events/__channels/events__channels.vanilla.js begin */
/**
 * @module events__channels
 */

modules.define('events__channels', ['events'], function(provide, events) {

var undef,

/**
 * Communication channels storage
 * @type Object
 */
    channels = {};

/**
 * Returns/destroys a named communication channel
 * @param {String} [id='default'] Channel ID
 * @param {Boolean} [drop=false] Destroy the channel
 * @returns {events.Emitter|undefined} Communication channel
 */
provide(function(id, drop) {
    if(typeof id === 'boolean') {
        drop = id;
        id = undef;
    }

    id || (id = 'default');

    if(drop) {
        if(channels[id]) {
            channels[id].un();
            delete channels[id];
        }
        return;
    }

    return channels[id] || (channels[id] = new events.Emitter());
});

});
/* ../../libs/bem-core/common.blocks/events/__channels/events__channels.vanilla.js end */
;
/* ../../libs/bem-core/common.blocks/ecma/__object/ecma__object.js begin */
/**
 * Возвращает массив свойств объекта
 * @param {Object} obj объект
 * @returns {Array}
 */
Object.keys || (Object.keys = function(obj) {
    var res = [];

    for(var i in obj) obj.hasOwnProperty(i) &&
        res.push(i);

    return res;
});
/* ../../libs/bem-core/common.blocks/ecma/__object/ecma__object.js end */
;
/* ../../libs/bem-core/common.blocks/ecma/__array/ecma__array.js begin */
(function() {

var ptp = Array.prototype,
    toStr = Object.prototype.toString,
    methods = {
        /**
         * Finds the index of an element in an array
         * @param {Object} item
         * @param {Number} [fromIdx] Starting from index (length - 1 - fromIdx, if fromIdx < 0)
         * @returns {Number} Element index or -1, if not found
         */
        indexOf : function(item, fromIdx) {
            fromIdx = +(fromIdx || 0);

            var t = this, len = t.length;

            if(len > 0 && fromIdx < len) {
                fromIdx = fromIdx < 0? Math.ceil(fromIdx) : Math.floor(fromIdx);
                fromIdx < -len && (fromIdx = 0);
                fromIdx < 0 && (fromIdx = fromIdx + len);

                while(fromIdx < len) {
                    if(fromIdx in t && t[fromIdx] === item)
                        return fromIdx;
                    ++fromIdx;
                }
            }

            return -1;
        },

        /**
         * Calls the callback for each element
         * @param {Function} callback Called for each element
         * @param {Object} [ctx=null] Callback context
         */
        forEach : function(callback, ctx) {
            var i = -1, t = this, len = t.length;
            while(++i < len) i in t &&
                (ctx? callback.call(ctx, t[i], i, t) : callback(t[i], i, t));
        },

        /**
         * Creates array B from array A so that B[i] = callback(A[i])
         * @param {Function} callback Called for each element
         * @param {Object} [ctx=null] Callback context
         * @returns {Array}
         */
        map : function(callback, ctx) {
            var i = -1, t = this, len = t.length,
                res = new Array(len);

            while(++i < len) i in t &&
                (res[i] = ctx? callback.call(ctx, t[i], i, t) : callback(t[i], i, t));

            return res;
        },

        /**
         * Creates an array containing only the elements from the source array that the callback returns true for. 
         * @param {Function} callback Called for each element
         * @param {Object} [ctx] Callback context
         * @returns {Array}
         */
        filter : function(callback, ctx) {
            var i = -1, t = this, len = t.length,
                res = [];

            while(++i < len) i in t &&
                (ctx? callback.call(ctx, t[i], i, t) : callback(t[i], i, t)) && res.push(t[i]);

            return res;
        },

        /**
         * Wraps the array using an accumulator
         * @param {Function} callback Called for each element
         * @param {Object} [initialVal] Initial value of the accumulator
         * @returns {Object} Accumulator
         */
        reduce : function(callback, initialVal) {
            var i = -1, t = this, len = t.length,
                res;

            if(arguments.length < 2) {
                while(++i < len) {
                    if(i in t) {
                        res = t[i];
                        break;
                    }
                }
            } else {
                res = initialVal;
            }

            while(++i < len) i in t &&
                (res = callback(res, t[i], i, t));

            return res;
        },

        /**
         * Checks whether at least one element in the array meets the condition in the callback
         * @param {Function} callback
         * @param {Object} [ctx=this] Callback context
         * @returns {Boolean}
         */
        some : function(callback, ctx) {
            var i = -1, t = this, len = t.length;

            while(++i < len)
                if(i in t && (ctx? callback.call(ctx, t[i], i, t) : callback(t[i], i, t)))
                    return true;

            return false;
        },

        /**
         * Checks whether every element in the array meets the condition in the callback
         * @param {Function} callback
         * @param {Object} [ctx=this] Context of the callback call
         * @returns {Boolean}
         */
        every : function(callback, ctx) {
            var i = -1, t = this, len = t.length;

            while(++i < len)
                if(i in t && !(ctx? callback.call(ctx, t[i], i, t) : callback(t[i], i, t)))
                    return false;

            return true;
        }
    };

for(var name in methods)
    ptp[name] || (ptp[name] = methods[name]);

Array.isArray || (Array.isArray = function(obj) {
    return toStr.call(obj) === '[object Array]';
});

})();
/* ../../libs/bem-core/common.blocks/ecma/__array/ecma__array.js end */
;
/* ../../libs/bem-core/common.blocks/ecma/__function/ecma__function.js begin */
(function() {

var slice = Array.prototype.slice;

Function.prototype.bind || (Function.prototype.bind = function(ctx) {
    var fn = this,
        args = slice.call(arguments, 1);

    return function() {
        return fn.apply(ctx, args.concat(slice.call(arguments)));
    };
});

})();
/* ../../libs/bem-core/common.blocks/ecma/__function/ecma__function.js end */
;
/* ../../libs/bem-core/common.blocks/i-bem/__dom/i-bem__dom.js begin */
/**
 * @module i-bem__dom
 */

modules.define(
    'i-bem__dom',
    ['i-bem', 'i-bem__internal', 'identify', 'objects', 'functions', 'jquery', 'dom'],
    function(provide, BEM, INTERNAL, identify, objects, functions, $, dom) {

var undef,
    win = $(window),
    doc = $(document),

/**
 * Storage for DOM elements by unique key
 * @private
 * @type Object
 */
    uniqIdToDomElems = {},

/**
 * Storage for blocks by unique key
 * @static
 * @private
 * @type Object
 */
    uniqIdToBlock = {},

/**
 * Storage for block parameters
 * @private
 * @type Object
 */
    domElemToParams = {},

/**
 * Storage for liveCtx event handlers
 * @private
 * @type Object
 */
    liveEventCtxStorage = {},

/**
 * Storage for liveClass event handlers
 * @private
 * @type Object
 */
    liveClassEventStorage = {},

    blocks = BEM.blocks,

    BEM_CLASS = 'i-bem',
    BEM_SELECTOR = '.' + BEM_CLASS,
    BEM_PARAMS_ATTR = 'data-bem',

    NAME_PATTERN = INTERNAL.NAME_PATTERN,

    MOD_DELIM = INTERNAL.MOD_DELIM,
    ELEM_DELIM = INTERNAL.ELEM_DELIM,

    EXTRACT_MODS_RE = RegExp(
        '[^' + MOD_DELIM + ']' + MOD_DELIM + '(' + NAME_PATTERN + ')' +
        '(?:' + MOD_DELIM + '(' + NAME_PATTERN + '))?$'),

    buildModPostfix = INTERNAL.buildModPostfix,
    buildClass = INTERNAL.buildClass;

/**
 * Initializes blocks on a DOM element
 * @private
 * @param {jQuery} domElem DOM element
 * @param {String} uniqInitId ID of the "initialization wave"
 */
function init(domElem, uniqInitId) {
    var domNode = domElem[0],
        params = getParams(domNode),
        blockName, blockParams;

    for(blockName in params) {
        if(params.hasOwnProperty(blockName)) {
            blockParams = params[blockName];
            processParams(blockParams, domNode, blockName, uniqInitId);
            var block = uniqIdToBlock[blockParams.uniqId];
            if(block) {
                if(block.domElem.index(domNode) < 0) {
                    block.domElem = block.domElem.add(domElem);
                    objects.extend(block.params, blockParams);
                }
            } else {
                initBlock(blockName, domElem, blockParams);
            }
        }
    }
}

/**
 * Initializes a specific block on a DOM element, or returns the existing block if it was already created
 * @private
 * @param {String} blockName Block name
 * @param {jQuery} domElem DOM element
 * @param {Object} [params] Initialization parameters
 * @param {Boolean} [forceLive] Force live initialization
 * @param {Function} [callback] Handler to call after complete initialization
 */
function initBlock(blockName, domElem, params, forceLive, callback) {
    if(typeof params === 'boolean') {
        callback = forceLive;
        forceLive = params;
        params = undef;
    }

    var domNode = domElem[0];
    params = processParams(params || getParams(domNode)[blockName], domNode, blockName);

    var uniqId = params.uniqId;
    if(uniqIdToBlock[uniqId]) {
        return uniqIdToBlock[uniqId]._init();
    }

    uniqIdToDomElems[uniqId] = uniqIdToDomElems[uniqId]?
        uniqIdToDomElems[uniqId].add(domElem) :
        domElem;

    var parentDomNode = domNode.parentNode;
    if(!parentDomNode || parentDomNode.nodeType === 11) { // jquery doesn't unique disconnected node
        $.unique(uniqIdToDomElems[uniqId]);
    }

    var blockClass = blocks[blockName] || DOM.decl(blockName, {}, { live : true }, true);
    if(!(blockClass._liveInitable = !!blockClass._processLive()) || forceLive || params.live === false) {
        forceLive && domElem.addClass(BEM_CLASS); // add css class for preventing memory leaks in further destructing

        var block = new blockClass(uniqIdToDomElems[uniqId], params, !!forceLive);
        delete uniqIdToDomElems[uniqId];
        callback && callback.apply(block, Array.prototype.slice.call(arguments, 4));
        return block;
    }
}

/**
 * Processes and adds necessary block parameters
 * @private
 * @param {Object} params Initialization parameters
 * @param {HTMLElement} domNode DOM node
 * @param {String} blockName Block name
 * @param {String} [uniqInitId] ID of the "initialization wave"
 */
function processParams(params, domNode, blockName, uniqInitId) {
    (params || (params = {})).uniqId ||
        (params.uniqId = (params.id? blockName + '-id-' + params.id : identify()) + (uniqInitId || identify()));

    var domUniqId = identify(domNode),
        domParams = domElemToParams[domUniqId] || (domElemToParams[domUniqId] = {});

    domParams[blockName] || (domParams[blockName] = params);

    return params;
}

/**
 * Helper for searching for a DOM element using a selector inside the context, including the context itself
 * @private
 * @param {jQuery} ctx Context
 * @param {String} selector CSS selector
 * @param {Boolean} [excludeSelf=false] Exclude context from search
 * @returns {jQuery}
 */
function findDomElem(ctx, selector, excludeSelf) {
    var res = ctx.find(selector);
    return excludeSelf?
       res :
       res.add(ctx.filter(selector));
}

/**
 * Returns parameters of a block's DOM element
 * @private
 * @param {HTMLElement} domNode DOM node
 * @returns {Object}
 */
function getParams(domNode) {
    var uniqId = identify(domNode);
    return domElemToParams[uniqId] ||
       (domElemToParams[uniqId] = extractParams(domNode));
}

/**
 * Retrieves block parameters from a DOM element
 * @private
 * @param {HTMLElement} domNode DOM node
 * @returns {Object}
 */
function extractParams(domNode) {
    var attrVal = domNode.getAttribute(BEM_PARAMS_ATTR);
    return attrVal? JSON.parse(attrVal) : {};
}

/**
 * Uncouple DOM node from the block. If this is the last node, then destroys the block.
 * @private
 * @param {DOM} block block
 * @param {HTMLElement} domNode DOM node
 */
function removeDomNodeFromBlock(block, domNode) {
    block.domElem.length === 1?
        block._destruct(true) :
        block.domElem = block.domElem.not(domNode);
}

var DOM = BEM.decl('i-bem__dom',/** @lends DOM.prototype */{
    /**
     * @class Base block for creating BEM blocks that have DOM representation
     * @constructs
     * @private
     * @param {jQuery} domElem DOM element that the block is created on
     * @param {Object} params Block parameters
     * @param {Boolean} [initImmediately=true]
     */
    __constructor : function(domElem, params, initImmediately) {
        /**
         * Block's DOM elements
         * @protected
         * @type jQuery
         */
        this.domElem = domElem;

        /**
         * Cache for names of events on DOM elements
         * @private
         * @type Object
         */
        this._eventNameCache = {};

        /**
         * Cache for elements
         * @private
         * @type Object
         */
        this._elemCache = {};

        /**
         * Unique block ID
         * @private
         * @type String
         */
        uniqIdToBlock[this._uniqId = params.uniqId || identify(this)] = this;

        /**
         * Flag for whether it's necessary to unbind from the document and window when destroying the block
         * @private
         * @type Boolean
         */
        this._needSpecialUnbind = false;

        this.__base(null, params, initImmediately);
    },

    /**
     * Finds blocks inside the current block or its elements (including context)
     * @protected
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEM[]}
     */
    findBlocksInside : function(elem, block) {
        return this._findBlocks('find', elem, block);
    },

    /**
     * Finds the first block inside the current block or its elements (including context)
     * @protected
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEM}
     */
    findBlockInside : function(elem, block) {
        return this._findBlocks('find', elem, block, true);
    },

    /**
     * Finds blocks outside the current block or its elements (including context)
     * @protected
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEM[]}
     */
    findBlocksOutside : function(elem, block) {
        return this._findBlocks('parents', elem, block);
    },

    /**
     * Finds the first block outside the current block or its elements (including context)
     * @protected
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEM}
     */
    findBlockOutside : function(elem, block) {
        return this._findBlocks('closest', elem, block)[0] || null;
    },

    /**
     * Finds blocks on DOM elements of the current block or its elements
     * @protected
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEM[]}
     */
    findBlocksOn : function(elem, block) {
        return this._findBlocks('', elem, block);
    },

    /**
     * Finds the first block on DOM elements of the current block or its elements
     * @protected
     * @param {String|jQuery} [elem] Block element
     * @param {String|Object} block Name or description (block,modName,modVal) of the block to find
     * @returns {BEM}
     */
    findBlockOn : function(elem, block) {
        return this._findBlocks('', elem, block, true);
    },

    _findBlocks : function(select, elem, block, onlyFirst) {
        if(!block) {
            block = elem;
            elem = undef;
        }

        var ctxElem = elem?
                (typeof elem === 'string'? this.findElem(elem) : elem) :
                this.domElem,
            isSimpleBlock = typeof block === 'string',
            blockName = isSimpleBlock? block : (block.block || block.blockName),
            selector = '.' +
                (isSimpleBlock?
                    buildClass(blockName) :
                    buildClass(blockName, block.modName, block.modVal)) +
                (onlyFirst? ':first' : ''),
            domElems = ctxElem.filter(selector);

        select && (domElems = domElems.add(ctxElem[select](selector)));

        if(onlyFirst) {
            return domElems[0]? initBlock(blockName, domElems.eq(0), true) : null;
        }

        var res = [],
            uniqIds = {};

        domElems.each(function(i, domElem) {
            var block = initBlock(blockName, $(domElem), true);
            if(!uniqIds[block._uniqId]) {
                uniqIds[block._uniqId] = true;
                res.push(block);
            }
        });

        return res;
    },

    /**
     * Adds an event handler for any DOM element
     * @protected
     * @param {jQuery} domElem DOM element where the event will be listened for
     * @param {String|Object} event Event name or event object
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEM}
     */
    bindToDomElem : function(domElem, event, fn) {
        fn?
            domElem.bind(
                this._buildEventName(event),
                $.proxy(fn, this)) :
            objects.each(event, function(fn, event) {
                this.bindToDomElem(domElem, event, fn);
            }, this);

        return this;
    },

    /**
     * Adds an event handler to the document
     * @protected
     * @param {String} event Event name
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEM}
     */
    bindToDoc : function(event, fn) {
        this._needSpecialUnbind = true;
        return this.bindToDomElem(doc, event, fn);
    },

    /**
     * Adds an event handler to the window
     * @protected
     * @param {String} event Event name
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEM}
     */
    bindToWin : function(event, fn) {
        this._needSpecialUnbind = true;
        return this.bindToDomElem(win, event, fn);
    },

    /**
     * Adds an event handler to the block's main DOM elements or its nested elements
     * @protected
     * @param {jQuery|String} [elem] Element
     * @param {String} event Event name
     * @param {Function} fn Handler function, which will be executed in the block's context
     * @returns {BEM}
     */
    bindTo : function(elem, event, fn) {
        if(!event || functions.isFunction(event)) { // if there is no element
            fn = event;
            event = elem;
            elem = this.domElem;
        } else if(typeof elem === 'string') {
            elem = this.elem(elem);
        }

        return this.bindToDomElem(elem, event, fn);
    },

    /**
     * Removes event handlers from any DOM element
     * @protected
     * @param {jQuery} domElem DOM element where the event was being listened for
     * @param {String} event Event name
     * @param {Function} [fn] Handler function
     * @returns {BEM}
     */
    unbindFromDomElem : function(domElem, event, fn) {
        event = this._buildEventName(event);

        fn?
            domElem.unbind(event, fn) :
            domElem.unbind(event);
        return this;
    },

    /**
     * Removes event handler from document
     * @protected
     * @param {String} event Event name
     * @param {Function} [fn] Handler function
     * @returns {BEM}
     */
    unbindFromDoc : function(event, fn) {
        return this.unbindFromDomElem(doc, event, fn);
    },

    /**
     * Removes event handler from window
     * @protected
     * @param {String} event Event name
     * @param {Function} [fn] Handler function
     * @returns {BEM}
     */
    unbindFromWin : function(event, fn) {
        return this.unbindFromDomElem(win, event, fn);
    },

    /**
     * Removes event handlers from the block's main DOM elements or its nested elements
     * @protected
     * @param {jQuery|String} [elem] Nested element
     * @param {String} event Event name
     * @param {Function} [fn] Handler function
     * @returns {BEM}
     */
    unbindFrom : function(elem, event, fn) {
        var argLen = arguments.length;
        if(argLen === 1) {
            event = elem;
            elem = this.domElem;
        } else if(argLen === 2 && functions.isFunction(event)) {
            fn = event;
            event = elem;
            elem = this.domElem;
        } else if(typeof elem === 'string') {
            elem = this.elem(elem);
        }

        return this.unbindFromDomElem(elem, event, fn);
    },

    /**
     * Builds a full name for an event
     * @private
     * @param {String} event Event name
     * @returns {String}
     */
    _buildEventName : function(event) {
        return event.indexOf(' ') > 1?
            event.split(' ').map(function(e) {
                return this._buildOneEventName(e);
            }, this).join(' ') :
            this._buildOneEventName(event);
    },

    /**
     * Builds a full name for a single event
     * @private
     * @param {String} event Event name
     * @returns {String}
     */
    _buildOneEventName : function(event) {
        var eventNameCache = this._eventNameCache;

        if(event in eventNameCache) return eventNameCache[event];

        var uniq = '.' + this._uniqId;

        if(event.indexOf('.') < 0) return eventNameCache[event] = event + uniq;

        var lego = '.bem_' + this.__self._name;

        return eventNameCache[event] = event.split('.').map(function(e, i) {
            return i === 0? e + lego : lego + '_' + e;
        }).join('') + uniq;
    },

    /**
     * Triggers block event handlers and live event handlers
     * @protected
     * @param {String} e Event name
     * @param {Object} [data] Additional information
     * @returns {BEM}
     */
    emit : function(e, data) {
        this
            .__base(e = this._buildEvent(e), data)
            .domElem && this._ctxEmit(e, data);

        return this;
    },

    _ctxEmit : function(e, data) {
        var _this = this,
            storage = liveEventCtxStorage[_this.__self._buildCtxEventName(e.type)],
            ctxIds = {};

        storage && _this.domElem.each(function() {
            var ctx = this,
                counter = storage.counter;
            while(ctx && counter) {
                var ctxId = identify(ctx, true);
                if(ctxId) {
                    if(ctxIds[ctxId]) break;
                    var storageCtx = storage.ctxs[ctxId];
                    if(storageCtx) {
                        objects.each(storageCtx, function(handler) {
                            handler.fn.call(
                                handler.ctx || _this,
                                e,
                                data);
                        });
                        counter--;
                    }
                    ctxIds[ctxId] = true;
                }
                ctx = ctx.parentNode;
            }
        });
    },

    /**
     * Sets a modifier for a block/nested element
     * @protected
     * @param {jQuery} [elem] Nested element
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @returns {BEM}
     */
    setMod : function(elem, modName, modVal) {
        if(elem && typeof modVal !== 'undefined' && elem.length > 1) {
            var _this = this;
            elem.each(function() {
                var item = $(this);
                item.__bemElemName = elem.__bemElemName;
                _this.setMod(item, modName, modVal);
            });
            return _this;
        }
        return this.__base(elem, modName, modVal);
    },

    /**
     * Retrieves modifier value from the DOM node's CSS class
     * @private
     * @param {String} modName Modifier name
     * @param {jQuery} [elem] Nested element
     * @param {String} [elemName] Name of the nested element
     * @returns {String} Modifier value
     */
    _extractModVal : function(modName, elem, elemName) {
        var domNode = (elem || this.domElem)[0],
            matches;

        domNode &&
            (matches = domNode.className
                .match(this.__self._buildModValRE(modName, elemName || elem)));

        return matches? matches[2] || true : '';
    },

    /**
     * Retrieves a name/value list of modifiers
     * @private
     * @param {Array} [modNames] Names of modifiers
     * @param {Object} [elem] Element
     * @returns {Object} Hash of modifier values by names
     */
    _extractMods : function(modNames, elem) {
        var res = {},
            extractAll = !modNames.length,
            countMatched = 0;

        ((elem || this.domElem)[0].className
            .match(this.__self._buildModValRE(
                '(' + (extractAll? NAME_PATTERN : modNames.join('|')) + ')',
                elem,
                'g')) || []).forEach(function(className) {
                    var matches = className.match(EXTRACT_MODS_RE);
                    res[matches[1]] = matches[2] || true;
                    ++countMatched;
                });

        // empty modifier values are not reflected in classes; they must be filled with empty values
        countMatched < modNames.length && modNames.forEach(function(modName) {
            modName in res || (res[modName] = '');
        });

        return res;
    },

    /**
     * Sets a modifier's CSS class for a block's DOM element or nested element
     * @private
     * @param {String} modName Modifier name
     * @param {String} modVal Modifier value
     * @param {String} oldModVal Old modifier value
     * @param {jQuery} [elem] Element
     * @param {String} [elemName] Element name
     */
    _onSetMod : function(modName, modVal, oldModVal, elem, elemName) {
        if(!elem && modName === 'js' && modVal === '') {
            return;
        }

        var _self = this.__self,
            classPrefix = _self._buildModClassPrefix(modName, elemName),
            classRE = _self._buildModValRE(modName, elemName),
            needDel = modVal === '' || modVal === false;

        (elem || this.domElem).each(function() {
            var className = this.className,
                modClassName = classPrefix;

            modVal !== true && (modClassName += MOD_DELIM + modVal);

            (oldModVal === true?
                classRE.test(className) :
                className.indexOf(classPrefix + MOD_DELIM) > -1)?
                    this.className = className.replace(
                        classRE,
                        (needDel? '' : '$1' + modClassName)) :
                    needDel || $(this).addClass(modClassName);
        });

        elemName && this
            .dropElemCache(elemName, modName, oldModVal)
            .dropElemCache(elemName, modName, modVal);
    },

    /**
     * Finds elements nested in a block
     * @protected
     * @param {jQuery} [ctx=this.domElem] Element where search is being performed
     * @param {String} names Nested element name (or names separated by spaces)
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @param {Boolean} [strictMode=false]
     * @returns {jQuery} DOM elements
     */
    findElem : function(ctx, names, modName, modVal, strictMode) {
        if(typeof ctx === 'string') {
            strictMode = modVal;
            modVal = modName;
            modName = names;
            names = ctx;
            ctx = this.domElem;
        }

        if(typeof modName === 'boolean') {
            strictMode = modName;
            modName = undef;
        }

        var _self = this.__self,
            selector = '.' +
                names.split(' ').map(function(name) {
                    return _self.buildClass(name, modName, modVal);
                }).join(',.'),
            res = findDomElem(ctx, selector);

        return strictMode? this._filterFindElemResults(res) : res;
    },

    /**
     * Filters results of findElem helper execution in strict mode
     * @param {jQuery} res DOM elements
     * @returns {jQuery} DOM elements
     */
    _filterFindElemResults : function(res) {
        var blockSelector = this.buildSelector(),
            domElem = this.domElem;
        return res.filter(function() {
            return domElem.index($(this).closest(blockSelector)) > -1;
        });
    },

    /**
     * Finds elements nested in a block
     * @protected
     * @param {String} name Nested element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {jQuery} DOM elements
     */
    _elem : function(name, modName, modVal) {
        var key = name + buildModPostfix(modName, modVal),
            res;

        if(!(res = this._elemCache[key])) {
            res = this._elemCache[key] = this.findElem(name, modName, modVal);
            res.__bemElemName = name;
        }

        return res;
    },

    /**
     * Lazy search for elements nested in a block (caches results)
     * @protected
     * @param {String} names Nested element name (or names separated by spaces)
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {jQuery} DOM elements
     */
    elem : function(names, modName, modVal) {
        if(modName && typeof modName !== 'string') {
            modName.__bemElemName = names;
            return modName;
        }

        if(names.indexOf(' ') < 0) {
            return this._elem(names, modName, modVal);
        }

        var res = $([]);
        names.split(' ').forEach(function(name) {
            res = res.add(this._elem(name, modName, modVal));
        }, this);
        return res;
    },

    /**
     * Finds elements outside the context
     * @param {jQuery} ctx context
     * @param {String} elemName Element name
     * @returns {jQuery} DOM elements
     */
    closestElem : function(ctx, elemName) {
        return ctx.closest(this.buildSelector(elemName));
    },

    /**
     * Clearing the cache for elements
     * @protected
     * @param {String} [names] Nested element name (or names separated by spaces)
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {BEM}
     */
    dropElemCache : function(names, modName, modVal) {
        if(names) {
            var modPostfix = buildModPostfix(modName, modVal);
            names.indexOf(' ') < 0?
                delete this._elemCache[names + modPostfix] :
                names.split(' ').forEach(function(name) {
                    delete this._elemCache[name + modPostfix];
                }, this);
        } else {
            this._elemCache = {};
        }

        return this;
    },

    /**
     * Retrieves parameters of a block element
     * @param {String|jQuery} elem Element
     * @returns {Object} Parameters
     */
    elemParams : function(elem) {
        var elemName;
        if(typeof elem === 'string') {
            elemName = elem;
            elem = this.elem(elem);
        } else {
            elemName = this.__self._extractElemNameFrom(elem);
        }

        return extractParams(elem[0])[this.__self.buildClass(elemName)] || {};
    },

    /**
     * Elemify given element
     * @param {jQuery} elem Element
     * @param {String} elemName Name
     * @returns {jQuery}
     */
    elemify : function(elem, elemName) {
        (elem = $(elem)).__bemElemName = elemName;
        return elem;
    },

    /**
     * Checks whether a DOM element is in a block
     * @protected
     * @param {jQuery} [ctx=this.domElem] Element where check is being performed
     * @param {jQuery} domElem DOM element
     * @returns {Boolean}
     */
    containsDomElem : function(ctx, domElem) {
        if(arguments.length === 1) {
            domElem = ctx;
            ctx = this.domElem;
        }

        return dom.contains(ctx, domElem);
    },

    /**
     * Builds a CSS selector corresponding to a block/element and modifier
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    buildSelector : function(elem, modName, modVal) {
        return this.__self.buildSelector(elem, modName, modVal);
    },

    /**
     * Destructs a block
     * @private
     */
    _destruct : function() {
        this.destruct();
        /** @deprecated: above code has fallback, remove it in next version */
        var _this = this,
            _self = _this.__self;

        _this._needSpecialUnbind && _self.doc.add(_self.win).unbind('.' + _this._uniqId);

        _this.__base();

        delete uniqIdToBlock[_this.un()._uniqId];
    }

}, /** @lends DOM */{

    /**
     * Scope
     * Will be set on onDomReady to `<body>`
     * @protected
     * @type jQuery
     */
    scope : null,

    /**
     * Document shortcut
     * @protected
     * @type jQuery
     */
    doc : doc,

    /**
     * Window shortcut
     * @protected
     * @type jQuery
     */
    win : win,

    /**
     * Processes a block's live properties
     * @private
     * @param {Boolean} [heedLive=false] Whether to take into account that the block already processed its live properties
     * @returns {Boolean} Whether the block is a live block
     */
    _processLive : function(heedLive) {
        var res = this._liveInitable;

        if('live' in this) {
            var noLive = typeof res === 'undefined';

            if(noLive ^ heedLive) {
                res = this.live() !== false;
                this.live = functions.noop;
            }
        }

        return res;
    },

    /**
     * Initializes blocks on a fragment of the DOM tree
     * @static
     * @param {jQuery} [ctx=scope] Root DOM node
     * @returns {jQuery} ctx Initialization context
     */
    init : function(ctx) {
        ctx || (ctx = DOM.scope);

        var uniqInitId = identify();
        findDomElem(ctx, BEM_SELECTOR).each(function() {
            init($(this), uniqInitId);
        });

        this._runInitFns();

        return ctx;
    },

    /**
     * Destroys blocks on a fragment of the DOM tree
     * @static
     * @param {jQuery} ctx Root DOM node
     * @param {Boolean} [excludeSelf=false] Exclude the main domElem
     */
    destruct : function(ctx, excludeSelf) {
        findDomElem(ctx, BEM_SELECTOR, excludeSelf).each(function(i, domNode) {
            var params = getParams(domNode);
            objects.each(params, function(blockParams) {
                if(blockParams.uniqId) {
                    var block = uniqIdToBlock[blockParams.uniqId];
                    block?
                        removeDomNodeFromBlock(block, domNode) :
                        delete uniqIdToDomElems[blockParams.uniqId];
                }
            });
            delete domElemToParams[identify(domNode)];
        });

        excludeSelf? ctx.empty() : ctx.remove();
    },

    /**
     * Replaces a fragment of the DOM tree inside the context, destroying old blocks and intializing new ones
     * @static
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content New content
     */
    update : function(ctx, content) {
        this.destruct(ctx, true);
        this.init(ctx.html(content));
    },

    /**
     * Changes a fragment of the DOM tree including the context and initializes blocks.
     * @static
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     */
    replace : function(ctx, content) {
        var prev = ctx.prev(),
            parent = ctx.parent();

        this.destruct(ctx);

        this.init(prev.length?
            $(content).insertAfter(prev) :
            $(content).prependTo(parent));
    },

    /**
     * Adds a fragment of the DOM tree at the end of the context and initializes blocks
     * @static
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     */
    append : function(ctx, content) {
        this.init($(content).appendTo(ctx));
    },

    /**
     * Adds a fragment of the DOM tree at the beginning of the context and initializes blocks
     * @static
     * @param {jQuery} ctx Root DOM node
     * @param {jQuery|String} content Content to be added
     */
    prepend : function(ctx, content) {
        this.init($(content).prependTo(ctx));
    },

    /**
     * Adds a fragment of the DOM tree before the context and initializes blocks
     * @static
     * @param {jQuery} ctx Contextual DOM node
     * @param {jQuery|String} content Content to be added
     */
    before : function(ctx, content) {
        this.init($(content).insertBefore(ctx));
    },

    /**
     * Adds a fragment of the DOM tree after the context and initializes blocks
     * @static
     * @param {jQuery} ctx Contextual DOM node
     * @param {jQuery|String} content Content to be added
     */
    after : function(ctx, content) {
        this.init($(content).insertAfter(ctx));
    },

    /**
     * Builds a full name for a live event
     * @static
     * @private
     * @param {String} e Event name
     * @returns {String}
     */
    _buildCtxEventName : function(e) {
        return this._name + ':' + e;
    },

    _liveClassBind : function(className, e, callback, invokeOnInit) {
        if(e.indexOf(' ') > -1) {
            e.split(' ').forEach(function(e) {
                this._liveClassBind(className, e, callback, invokeOnInit);
            }, this);
        } else {
            var storage = liveClassEventStorage[e],
                uniqId = identify(callback);

            if(!storage) {
                storage = liveClassEventStorage[e] = {};
                DOM.scope.bind(e, this._liveClassTrigger.bind(this));
            }

            storage = storage[className] || (storage[className] = { uniqIds : {}, fns : [] });

            if(!(uniqId in storage.uniqIds)) {
                storage.fns.push({ uniqId : uniqId, fn : this._buildLiveEventFn(callback, invokeOnInit) });
                storage.uniqIds[uniqId] = storage.fns.length - 1;
            }
        }

        return this;
    },

    _liveClassUnbind : function(className, e, callback) {
        var storage = liveClassEventStorage[e];
        if(storage) {
            if(callback) {
                if(storage = storage[className]) {
                    var uniqId = identify(callback);
                    if(uniqId in storage.uniqIds) {
                        var i = storage.uniqIds[uniqId],
                            len = storage.fns.length - 1;
                        storage.fns.splice(i, 1);
                        while(i < len) storage.uniqIds[storage.fns[i++].uniqId] = i - 1;
                        delete storage.uniqIds[uniqId];
                    }
                }
            } else {
                delete storage[className];
            }
        }

        return this;
    },

    _liveClassTrigger : function(e) {
        var storage = liveClassEventStorage[e.type];
        if(storage) {
            var node = e.target, classNames = [];
            for(var className in storage) {
                storage.hasOwnProperty(className) && classNames.push(className);
            }
            do {
                var nodeClassName = ' ' + node.className + ' ', i = 0;
                while(className = classNames[i++]) {
                    if(nodeClassName.indexOf(' ' + className + ' ') > -1) {
                        var j = 0, fns = storage[className].fns, fn, stopPropagationAndPreventDefault = false;
                        while(fn = fns[j++])
                            if(fn.fn.call($(node), e) === false) stopPropagationAndPreventDefault = true;

                        stopPropagationAndPreventDefault && e.preventDefault();
                        if(stopPropagationAndPreventDefault || e.isPropagationStopped()) return;

                        classNames.splice(--i, 1);
                    }
                }
            } while(classNames.length && (node = node.parentNode));
        }
    },

    _buildLiveEventFn : function(callback, invokeOnInit) {
        var _this = this;
        return function(e) {
            e.currentTarget = this;
            var args = [
                    _this._name,
                    $(this).closest(_this.buildSelector()),
                    true
                ],
                block = initBlock.apply(null, invokeOnInit? args.concat([callback, e]) : args);

            if(block && !invokeOnInit && callback)
                return callback.apply(block, arguments);
        };
    },

    /**
     * Helper for live initialization for an event on DOM elements of a block or its elements
     * @static
     * @protected
     * @param {String} [elemName] Element name or names (separated by spaces)
     * @param {String} event Event name
     * @param {Function} [callback] Handler to call after successful initialization
     */
    liveInitOnEvent : function(elemName, event, callback) {
        return this.liveBindTo(elemName, event, callback, true);
    },

    /**
     * Helper for subscribing to live events on DOM elements of a block or its elements
     * @static
     * @protected
     * @param {String|Object} [to] Description (object with modName, modVal, elem) or name of the element or elements (space-separated)
     * @param {String} event Event name
     * @param {Function} [callback] Handler
     */
    liveBindTo : function(to, event, callback, invokeOnInit) {
        if(!event || functions.isFunction(event)) {
            callback = event;
            event = to;
            to = undef;
        }

        if(!to || typeof to === 'string') {
            to = { elem : to };
        }

        if(to.elem && to.elem.indexOf(' ') > 0) {
            to.elem.split(' ').forEach(function(elem) {
                this._liveClassBind(
                    this.buildClass(elem, to.modName, to.modVal),
                    event,
                    callback,
                    invokeOnInit);
            }, this);
            return this;
        }

        return this._liveClassBind(
            this.buildClass(to.elem, to.modName, to.modVal),
            event,
            callback,
            invokeOnInit);
    },

    /**
     * Helper for unsubscribing from live events on DOM elements of a block or its elements
     * @static
     * @protected
     * @param {String} [elem] Name of the element or elements (space-separated)
     * @param {String} event Event name
     * @param {Function} [callback] Handler
     */
    liveUnbindFrom : function(elem, event, callback) {
        if(elem.indexOf(' ') > 1) {
            elem.split(' ').forEach(function(elem) {
                this._liveClassUnbind(
                    this.buildClass(elem),
                    event,
                    callback);
            }, this);
            return this;
        }

        return this._liveClassUnbind(
            this.buildClass(elem),
            event,
            callback);
    },

    /**
     * Helper for live initialization when a different block is initialized
     * @static
     * @private
     * @param {String} event Event name
     * @param {String} blockName Name of the block that should trigger a reaction when initialized
     * @param {Function} callback Handler to be called after successful initialization in the new block's context
     * @param {String} findFnName Name of the method for searching
     */
    _liveInitOnBlockEvent : function(event, blockName, callback, findFnName) {
        var name = this._name;
        blocks[blockName].on(event, function(e) {
            var args = arguments,
                blocks = e.target[findFnName](name);

            callback && blocks.forEach(function(block) {
                callback.apply(block, args);
            });
        });
        return this;
    },

    /**
     * Helper for live initialization for a different block's event on the current block's DOM element
     * @static
     * @protected
     * @param {String} event Event name
     * @param {String} blockName Name of the block that should trigger a reaction when initialized
     * @param {Function} callback Handler to be called after successful initialization in the new block's context
     */
    liveInitOnBlockEvent : function(event, blockName, callback) {
        return this._liveInitOnBlockEvent(event, blockName, callback, 'findBlocksOn');
    },

    /**
     * Helper for live initialization for a different block's event inside the current block
     * @static
     * @protected
     * @param {String} event Event name
     * @param {String} blockName Name of the block that should trigger a reaction when initialized
     * @param {Function} [callback] Handler to be called after successful initialization in the new block's context
     */
    liveInitOnBlockInsideEvent : function(event, blockName, callback) {
        return this._liveInitOnBlockEvent(event, blockName, callback, 'findBlocksOutside');
    },

    /**
     * Adds a live event handler to a block, based on a specified element where the event will be listened for
     * @static
     * @protected
     * @param {jQuery} [ctx] The element in which the event will be listened for
     * @param {String} e Event name
     * @param {Object} [data] Additional information that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [fnCtx] Handler's context
     */
    on : function(ctx, e, data, fn, fnCtx) {
        return ctx.jquery?
            this._liveCtxBind(ctx, e, data, fn, fnCtx) :
            this.__base(ctx, e, data, fn);
    },

    /**
     * Removes the live event handler from a block, based on a specified element where the event was being listened for
     * @static
     * @protected
     * @param {jQuery} [ctx] The element in which the event was being listened for
     * @param {String} e Event name
     * @param {Function} [fn] Handler
     * @param {Object} [fnCtx] Handler context
     */
    un : function(ctx, e, fn, fnCtx) {
        return ctx.jquery?
            this._liveCtxUnbind(ctx, e, fn, fnCtx) :
            this.__base(ctx, e, fn);
    },

    /**
     * Adds a live event handler to a block, based on a specified element where the event will be listened for
     * @static
     * @private
     * @param {jQuery} ctx The element in which the event will be listened for
     * @param {String} e  Event name
     * @param {Object} [data] Additional information that the handler gets as e.data
     * @param {Function} fn Handler
     * @param {Object} [fnCtx] Handler context
     */
    _liveCtxBind : function(ctx, e, data, fn, fnCtx) {
        if(typeof e === 'string') {
            if(functions.isFunction(data)) {
                fnCtx = fn;
                fn = data;
                data = undef;
            }

            if(e.indexOf(' ') > -1) {
                e.split(' ').forEach(function(e) {
                    this._liveCtxBind(ctx, e, data, fn, fnCtx);
                }, this);
            } else {
                var ctxE = this._buildCtxEventName(e),
                    storage = liveEventCtxStorage[ctxE] ||
                        (liveEventCtxStorage[ctxE] = { counter : 0, ctxs : {} });

                ctx.each(function() {
                    var ctxId = identify(this),
                        ctxStorage = storage.ctxs[ctxId];
                    if(!ctxStorage) {
                        ctxStorage = storage.ctxs[ctxId] = {};
                        ++storage.counter;
                    }
                    ctxStorage[identify(fn) + (fnCtx? identify(fnCtx) : '')] = {
                        fn : fn,
                        data : data,
                        ctx : fnCtx
                    };
                });
            }
        } else {
            objects.each(e, function(fn, e) {
                this._liveCtxBind(ctx, e, fn, data);
            }, this);
        }

        return this;
    },

    /**
     * Removes a live event handler from a block, based on a specified element where the event was being listened for
     * @static
     * @private
     * @param {jQuery} ctx The element in which the event was being listened for
     * @param {String} e Event name
     * @param {Function} [fn] Handler
     * @param {Object} [fnCtx] Handler context
     */
    _liveCtxUnbind : function(ctx, e, fn, fnCtx) {
        var storage = liveEventCtxStorage[e = this._buildCtxEventName(e)];

        if(storage) {
            ctx.each(function() {
                var ctxId = identify(this, true),
                    ctxStorage;
                if(ctxId && (ctxStorage = storage.ctxs[ctxId])) {
                    fn && delete ctxStorage[identify(fn) + (fnCtx? identify(fnCtx) : '')];
                    if(!fn || objects.isEmpty(ctxStorage)) {
                        storage.counter--;
                        delete storage.ctxs[ctxId];
                    }
                }
            });
            storage.counter || delete liveEventCtxStorage[e];
        }

        return this;
    },

    /**
     * Retrieves the name of an element nested in a block
     * @static
     * @private
     * @param {jQuery} elem Nested element
     * @returns {String|undef}
     */
    _extractElemNameFrom : function(elem) {
        if(elem.__bemElemName) return elem.__bemElemName;

        var matches = elem[0].className.match(this._buildElemNameRE());
        return matches? matches[1] : undef;
    },

    /**
     * @deprecated use elemParams
     */
    extractParams : extractParams,

    /**
     * Builds a prefix for the CSS class of a DOM element or nested element of the block, based on modifier name
     * @static
     * @private
     * @param {String} modName Modifier name
     * @param {jQuery|String} [elem] Element
     * @returns {String}
     */
    _buildModClassPrefix : function(modName, elem) {
        return this._name +
               (elem?
                   ELEM_DELIM + (typeof elem === 'string'? elem : this._extractElemNameFrom(elem)) :
                   '') +
               MOD_DELIM + modName;
    },

    /**
     * Builds a regular expression for extracting modifier values from a DOM element or nested element of a block
     * @static
     * @private
     * @param {String} modName Modifier name
     * @param {jQuery|String} [elem] Element
     * @param {String} [quantifiers] Regular expression quantifiers
     * @returns {RegExp}
     */
    _buildModValRE : function(modName, elem, quantifiers) {
        return new RegExp(
            '(\\s|^)' +
            this._buildModClassPrefix(modName, elem) +
            '(?:' + MOD_DELIM + '(' + NAME_PATTERN + '))?(?=\\s|$)',
            quantifiers);
    },

    /**
     * Builds a regular expression for extracting names of elements nested in a block
     * @static
     * @private
     * @returns {RegExp}
     */
    _buildElemNameRE : function() {
        return new RegExp(this._name + ELEM_DELIM + '(' + NAME_PATTERN + ')(?:\\s|$)');
    },

    /**
     * Builds a CSS class corresponding to the block/element and modifier
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    buildClass : function(elem, modName, modVal) {
        return buildClass(this._name, elem, modName, modVal);
    },

    /**
     * Builds a CSS selector corresponding to the block/element and modifier
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String} [modVal] Modifier value
     * @returns {String}
     */
    buildSelector : function(elem, modName, modVal) {
        return '.' + this.buildClass(elem, modName, modVal);
    }
});

/**
 * Returns a block on a DOM element and initializes it if necessary
 * @param {String} blockName Block name
 * @param {Object} params Block parameters
 * @returns {BEM}
 */
$.fn.bem = function(blockName, params) {
    return initBlock(blockName, this, params, true);
};

/**
 * Set default scope after DOM ready
 */
$(function() {
    DOM.scope = $('body');
});

provide(DOM);

});

/* ../../libs/bem-core/common.blocks/i-bem/__dom/i-bem__dom.js end */
;
/* ../../libs/bem-core/common.blocks/jquery/jquery.js begin */
/**
 * @module jquery
 */

modules.define(
    'jquery',
    ['loader_type_js', 'jquery__config'],
    function(provide, loader, cfg) {

/* global jQuery */

function doProvide() {
    provide(jQuery.noConflict(true));
}

typeof jQuery !== 'undefined'?
    doProvide() :
    loader(cfg.url, doProvide);

});
/* ../../libs/bem-core/common.blocks/jquery/jquery.js end */
;
/* ../../libs/bem-core/common.blocks/loader/_type/loader_type_js.js begin */
/**
 * @module loader_type_js
 * @version 1.0.0
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 */

modules.define('loader_type_js', function(provide) {

var loading = {},
    loaded = {},
    head = document.getElementsByTagName('head')[0],
    onLoad = function(path) {
        loaded[path] = true;
        var cbs = loading[path], cb, i = 0;
        delete loading[path];
        while(cb = cbs[i++]) {
            cb();
        }
    };

provide(function(path, cb) {
    if(loaded[path]) {
        cb();
        return;
    }

    if(loading[path]) {
        loading[path].push(cb);
        return;
    }

    loading[path] = [cb];

    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.charset = 'utf-8';
    script.src = (location.protocol === 'file:' && !path.indexOf('//')? 'http:' : '') + path;
    script.onreadystatechange === null?
        script.onreadystatechange = function() {
            var readyState = this.readyState;
            if(readyState === 'loaded' || readyState === 'complete') {
                script.onreadystatechange = null;
                onLoad(path);
            }
        } :
        script.onload = script.onerror = function() {
            script.onload = script.onerror = null;
            onLoad(path);
        };

    head.insertBefore(script, head.lastChild);
});

});

/* ../../libs/bem-core/common.blocks/loader/_type/loader_type_js.js end */
;
/* ../../libs/bem-core/common.blocks/jquery/__config/jquery__config.js begin */
/**
 * @module jquery__config
 */

modules.define('jquery__config', function(provide) {

provide({
    url : '//yandex.st/jquery/2.0.3/jquery.min.js'
});

});
/* ../../libs/bem-core/common.blocks/jquery/__config/jquery__config.js end */
;
/* ../../libs/bem-core/desktop.blocks/jquery/__config/jquery__config.js begin */
/**
 * @module jquery__config
 */

modules.define(
    'jquery__config',
    ['ua', 'objects'],
    function(provide, ua, objects, base) {

provide(
    ua.msie && parseInt(ua.version, 10) < 9?
        objects.extend(
            base,
            {
                url : '//yandex.st/jquery/1.10.2/jquery.min.js'
            }) :
        base);

});
/* ../../libs/bem-core/desktop.blocks/jquery/__config/jquery__config.js end */
;
/* ../../libs/bem-core/desktop.blocks/ua/ua.js begin */
/** 
 * @module ua
 * @description inspired by http://code.jquery.com/jquery-migrate-1.1.1.js
 */

modules.define('ua', function(provide) {

var ua = navigator.userAgent.toLowerCase(),
    match = /(chrome)[ \/]([\w.]+)/.exec(ua) ||
        /(webkit)[ \/]([\w.]+)/.exec(ua) ||
        /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) ||
        /(msie) ([\w.]+)/.exec(ua) ||
        ua.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) ||
        [],
    matched = {
        browser : match[1] || '',
        version : match[2] || '0'
    },
    browser = {};

if(matched.browser) {
    browser[matched.browser] = true;
    browser.version = matched.version;
}

if(browser.chrome) {
    browser.webkit = true;
} else if(browser.webkit) {
    browser.safari = true;
}

provide(browser);

});

/* ../../libs/bem-core/desktop.blocks/ua/ua.js end */
;
/* ../../libs/bem-core/common.blocks/dom/dom.js begin */
/**
 * @module dom
 */

modules.define('dom', ['jquery'], function(provide, $) {

provide({
    /**
     * Checks whether a DOM elem is in a context
     * @param {jQuery} ctx DOM elem where check is being performed
     * @param {jQuery} domElem DOM elem to check
     * @returns {Boolean}
     */
    contains : function(ctx, domElem) {
        var res = false;

        domElem.each(function() {
            var domNode = this;
            do {
                if(~ctx.index(domNode)) return !(res = true);
            } while(domNode = domNode.parentNode);

            return res;
        });

        return res;
    },

    /**
     * Returns current focused DOM elem in document
     * @returns {jQuery}
     */
    getFocused : function() {
        // "Error: Unspecified error." in iframe in IE9
        try { return $(document.activeElement); } catch(e) {}
    },

    /**
     * Checks whether a DOM element contains focus
     * @param domElem
     * @returns {Boolean}
     */
    containsFocus : function(domElem) {
        return this.contains(domElem, this.getFocused());
    },

    /**
    * Checks whether a browser currently can set focus on DOM elem
    * @param {jQuery} domElem
    * @returns {Boolean}
    */
    isFocusable : function(domElem) {
        var domNode = domElem[0];

        if(!domNode) return false;

        switch(domNode.tagName.toLowerCase()) {
            case 'iframe':
                return true;

            case 'input':
            case 'button':
            case 'textarea':
            case 'select':
                return !domNode.disabled;

            case 'a':
                return !!domNode.href;

            default:
                return domNode.hasAttribute('tabindex');
        }
    },

    /**
    * Checks whether a domElem is intended to edit text
    * @param {jQuery} domElem
    * @returns {Boolean}
    */
    isEditable : function(domElem) {
        var domNode = domElem[0];

        if(!domNode) return false;

        switch(domNode.tagName.toLowerCase()) {
            case 'input':
                var type = domNode.type;
                return (type === 'text' || type === 'password') && !domNode.disabled && !domNode.readOnly;

            case 'textarea':
                return !domNode.disabled && !domNode.readOnly;

            default:
                return domNode.contentEditable === 'true';
        }
    }
});

});
/* ../../libs/bem-core/common.blocks/dom/dom.js end */
;
/* ../../libs/bem-core/common.blocks/i-bem/__internal/i-bem__internal.vanilla.js begin */
/**
 * @module i-bem__internal
 */

modules.define('i-bem__internal', function(provide) {

var undef,
/**
 * Separator for modifiers and their values
 * @const
 * @type String
 */
    MOD_DELIM = '_',

/**
 * Separator between names of a block and a nested element
 * @const
 * @type String
 */
    ELEM_DELIM = '__',

/**
 * Pattern for acceptable element and modifier names
 * @const
 * @type String
 */
    NAME_PATTERN = '[a-zA-Z0-9-]+';

function isSimple(obj) {
    var typeOf = typeof obj;
    return typeOf === 'string' || typeOf === 'number' || typeOf === 'boolean';
}

function buildModPostfix(modName, modVal) {
    var res = '';
    /* jshint eqnull: true */
    if(modVal != null && modVal !== false) {
        res += MOD_DELIM + modName;
        modVal !== true && (res += MOD_DELIM + modVal);
    }
    return res;
}

function buildBlockClass(name, modName, modVal) {
    return name + buildModPostfix(modName, modVal);
}

function buildElemClass(block, name, modName, modVal) {
    return buildBlockClass(block, undef, undef) +
        ELEM_DELIM + name +
        buildModPostfix(modName, modVal);
}

provide({
    NAME_PATTERN : NAME_PATTERN,

    MOD_DELIM : MOD_DELIM,
    ELEM_DELIM : ELEM_DELIM,

    buildModPostfix : buildModPostfix,

    /**
     * Builds the class of a block or element with a modifier
     * @private
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {String} [modName] Modifier name
     * @param {String|Number} [modVal] Modifier value
     * @returns {String} Class
     */
    buildClass : function(block, elem, modName, modVal) {
        if(isSimple(modName)) {
            if(!isSimple(modVal)) {
                modVal = modName;
                modName = elem;
                elem = undef;
            }
        } else if(typeof modName !== 'undefined') {
            modName = undef;
        } else if(elem && typeof elem !== 'string') {
            elem = undef;
        }

        if(!(elem || modName)) { // optimization for simple case
            return block;
        }

        return elem?
            buildElemClass(block, elem, modName, modVal) :
            buildBlockClass(block, modName, modVal);
    },

    /**
     * Builds full classes for a buffer or element with modifiers
     * @private
     * @param {String} block Block name
     * @param {String} [elem] Element name
     * @param {Object} [mods] Modifiers
     * @returns {String} Class
     */
    buildClasses : function(block, elem, mods) {
        if(elem && typeof elem !== 'string') {
            mods = elem;
            elem = undef;
        }

        var res = elem?
            buildElemClass(block, elem, undef, undef) :
            buildBlockClass(block, undef, undef);

        if(mods) {
            for(var modName in mods) {
                if(mods.hasOwnProperty(modName) && mods[modName]) {
                    res += ' ' + (elem?
                        buildElemClass(block, elem, modName, mods[modName]) :
                        buildBlockClass(block, modName, mods[modName]));
                }
            }
        }

        return res;
    }
});

});
/* ../../libs/bem-core/common.blocks/i-bem/__internal/i-bem__internal.vanilla.js end */
;
/* ../../libs/bem-core/common.blocks/ecma/__string/ecma__string.js begin */
(function() {

String.prototype.trim || (String.prototype.trim = function() {
    var str = this.replace(/^\s\s*/, ''),
        ws = /\s/,
        i = str.length;

    while(ws.test(str.charAt(--i)));

    return str.slice(0, i + 1);
});

})();
/* ../../libs/bem-core/common.blocks/ecma/__string/ecma__string.js end */
;
/* ../../libs/bem-core/common.blocks/ecma/__json/ecma__json.js begin */
(function(undefined) {

if(window.JSON) return;

var _toString = Object.prototype.toString,
    escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
    meta = {
        '\b' : '\\b',
        '\t' : '\\t',
        '\n' : '\\n',
        '\f' : '\\f',
        '\r' : '\\r',
        '"' : '\\"',
        '\\' : '\\\\'
    },
    stringify;

window.JSON = {
    stringify : stringify = function(val) {
        if(val === null) {
            return 'null';
        }
        if(typeof val === 'undefined') {
            return undefined;
        }
        var res, i, strVal;
        switch(_toString.call(val)) {
            case '[object String]':
                escapable.lastIndex = 0;
                return '"' +
                    (escapable.test(val)?
                        val.replace(escapable, function(a) {
                            var c = meta[a];
                            return typeof c === 'string'? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                        }) :
                        val) +
                    '"';

            case '[object Number]':
            case '[object Boolean]':
                return '' + val;

            case '[object Array]':
                res = '['; i = 0;
                var len = val.length;
                while(i < len) {
                    strVal = stringify(val[i]);
                    res += (i++? ',' : '') + (typeof strVal === 'undefined'? 'null' : strVal);
                }
                return res + ']';

            case '[object Object]':
                if(_toString.call(val.toJSON) === '[object Function]') {
                    return stringify(val.toJSON());
                }
                res = '{'; i = 0;
                for(var key in val) {
                    if(val.hasOwnProperty(key)) {
                        strVal = stringify(val[key]);
                        typeof strVal !== 'undefined' && (res += (i++? ',' : '') + '"' + key + '":' + strVal);
                    }
                }
                return res + '}';

            default:
                return undefined;
        }
    },

    parse : function(str) {
        /*jshint -W061 */
        return Function('return ' + str)();
    }
};
})();
/* ../../libs/bem-core/common.blocks/ecma/__json/ecma__json.js end */
;
/* ../../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init_auto.js begin */
/* дефолтная инициализация */
modules.require(['i-bem__dom', 'jquery'], function(DOM, $) {

$(function() {
    DOM.init();
});

});
/* ../../libs/bem-core/common.blocks/i-bem/__dom/_init/i-bem__dom_init_auto.js end */
;
/* ../../desktop.blocks/grid/grid.js begin */
modules.define('i-bem__dom', ['jquery', 'BEMHTML', 'events__channels'], function(provide, $, BEMHTML, channels, DOM) {

    var CHANNEL_NAME = 'cells';
    var CHANNEL_EVENT_RESET = 'reset';
    var CHANNEL_EVENT_CHEAT = 'cheat';
    var CHANNEL_EVENT_VALIDATE = 'validate';

    DOM.decl('grid', {
        onSetMod: {
            'js': {
                'inited': function() {
                    this.delMod('reset')
                        .setMod('state', 'gaming');

                    this.grid = [];
                    this.buildWorld();

                    var channel = channels(CHANNEL_NAME);
                    var cellsClosed = 0;

                    this.cells = DOM.blocks.cell;

                    channel.on(CHANNEL_EVENT_RESET, {}, function () {
                        this.resetGrid();
                    }, this);

                    channel.on(CHANNEL_EVENT_CHEAT, {}, function () {
                        this.toggleMod('cheat');
                    }, this);

                    channel.on(CHANNEL_EVENT_VALIDATE, {}, function () {
                        var markedCorrectMines = 0;
                        this.cells.forEach(function(cell) {
                            if ((cell.hasMod('state', 'maybe')) && cell.params.mine ) markedCorrectMines++;
                        });
                        if ((markedCorrectMines === this.params.totalMines) ) this.setMod('state', 'won');
                    }, this);
                }
            },
            'state': {
                'gameover': function() {
                    this.cells.forEach(function(cell) {
                        cell.params.mine && cell.setMod('state', 'mine');
                    });
                }
            },

        },
        buildWorld: function() {
            this.cellsClosed = this.params.width * this.params.height;
            this.buildGrid();
            this.addRandomMines();
            this.buildGridOnDOM();
        },
        buildGrid: function() {
            for(var lines = 0; lines < this.params.height; ++lines) {
                this.grid[lines] = [];
                for(var cols = 0; cols < this.params.width; ++cols) {
                    this.grid[lines][cols] = {
                        x: cols,
                        y: lines,
                        mine: false
                    };
                }
            }
        },
        addRandomMines: function() {
            var minesPushed = 0;
            while (minesPushed < this.params.totalMines) {
                var column = Math.floor(this.params.width * Math.random());
                var line = Math.floor(this.params.height * Math.random());
                var currentMine = this.grid[line][column].mine;
                if (!currentMine) {
                    this.grid[line][column].mine = true;
                    ++minesPushed;
                }
            }
        },
        buildGridOnDOM: function() {
            var gameField = [];
            for(var lineNum = 0; lineNum < this.params.height; ++lineNum) {
                gameField.push( {
                    block: 'grid',
                    elem: 'line'
                })
            }
            // filling lines with boxes
            var _this = this, 
                index = 0;
            gameField.forEach(function(line) {
                line.content = [];
                for (var columnNum = 0; columnNum < _this.params.width; ++columnNum) {
                    var currentCell = _this.grid[index][columnNum];
                    line.content.push( {
                            block: 'cell',
                            mods: {state: 'closed'},
                            js: {
                                x: currentCell.x,
                                y: currentCell.y,
                                mine: currentCell.mine
                            }
                    });
                }

                index++;
            });
            // appending our gameField object to DOM
            DOM.append(
                this.domElem,
                BEMHTML.apply(gameField)
            );
        },
        resetGrid: function() {
                var isCheatReady =  this.hasMod('cheat');
                DOM.replace(this.domElem, BEMHTML.apply( {
                    block: 'grid',
                    js: this.params,
                    mods: { cheat: isCheatReady }
                }));
            }
    }, {

    });

    provide(DOM);
});

/* ../../desktop.blocks/grid/grid.js end */
;
/* ../../desktop.blocks/cell/cell.js begin */
modules.define('i-bem__dom', ['jquery'], function (provide, jquery, DOM) {

    DOM.decl('cell',
        {
            onSetMod: {
                'js': {
                    'inited': function () {

                        this.bindTo('click', function() {
                            if(this.params.mine) {
                                this.setMod('state', 'mine');
                            } else this.setMod('state', 'open');
                        });

                        this.bindTo('contextmenu', function() {
                            if (!this.hasMod('state', 'open')) this.toggleMod('state', 'maybe', 'closed');
                            return false;
                        });

                        this.params.mine && this.setMod('che');


                    }
                },
                'state':{
                    'mine': function(){
                        console.log('BIG BA-DA-BOOOOM! BANG!');
                        this.findBlockOutside('grid').
                            setMod('state', 'gameover');
                    },
                    'open': function(){
                        var grid = this.findBlockOutside('grid');
                        grid.cellsClosed--;
                        var minesNumber = this.countMinesAround();
                        if (minesNumber === 0) {
                            this.openCellsAround(this.params);
                        } else this.domElem[0].textContent = minesNumber;

                        grid.cellsClosed === grid.params.totalMines && grid.setMod('state', 'won');
                    }
                }

            },
            countMinesAround: function(){
                var grid = this.findBlockOutside('grid').grid;
                var minesAround = 0;
                for(var dy = -1; dy < 2; ++dy){
                    var line = this.params.y + dy;
                    for(var dx = -1; dx < 2; ++dx){
                        var column = this.params.x + dx;
                        if (grid[line] && grid[line][column] && grid[line][column].mine) minesAround++;
                    }
                }
                return minesAround;
            },
            openCellsAround: function(params){
                var parent = this.findBlockOutside('grid');
                var cells = parent.findBlocksInside('cell');
                var grid = parent.grid;
                for(var dy = -1; dy < 2; ++dy){
                    var line = params.y + dy;
                    for(var dx = -1; dx < 2; ++dx) {
                        var column = params.x + dx;
                        if (grid[line] && grid[line][column]) {
                            cells.forEach(function(currentCell) {
                                if ((currentCell.params.x === column) && (currentCell.params.y === line)) {
                                    currentCell.setMod('state', 'open');
                                    return;
                                }
                            });
                        }
                    }
                }
            }
        },
        {});


    provide(DOM);

});

/* ../../desktop.blocks/cell/cell.js end */
;
/* ../../desktop.blocks/menu/menu.js begin */
modules.define('i-bem__dom', ['events__channels'], function(provide, channels, DOM) {

    var CHANNEL_NAME = 'cells';
    var CHANNEL_EVENT_RESET = 'reset';
    var CHANNEL_EVENT_CHEAT = 'cheat';
    var CHANNEL_EVENT_VALIDATE = 'validate';

DOM.decl('menu',
    {
        onSetMod : {
            'js' : {
                'inited': function() {

                    var channel = channels(CHANNEL_NAME);

                    this.bindTo('reset', 'click', function() {
                        channel.trigger(CHANNEL_EVENT_RESET);
                    });

                    this.bindTo('cheat', 'click', function() {
                        this.toggleMod('cheat');
                        channel.trigger(CHANNEL_EVENT_CHEAT);
                    });

                    this.bindTo('validate', 'click', function() {
                        channel.trigger(CHANNEL_EVENT_VALIDATE);
                    });
                }
            }
        }
        });

    provide(DOM);

});

/* ../../desktop.blocks/menu/menu.js end */
;
/* ../../libs/bem-components/common.blocks/link/link.js begin */
modules.define('i-bem__dom', function(provide, BEMDOM) {

BEMDOM.decl('link', {
    _onClick : function(e) {
        e.preventDefault();
        this.hasMod('disabled') || this.emit('click');
    }
}, {
    live : function() {
        this.liveBindTo('pointerclick', function(e) {
            this._onClick(e);
        });
    }
});

provide(BEMDOM);

});

/* ../../libs/bem-components/common.blocks/link/link.js end */
;
/* ../../libs/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointer.js begin */
﻿/**
 * Basic polyfill for "Pointer Events" W3C Candidate Recommendation
 * with addition of custom pointerpress/pointerrelease events.
 *
 * @see http://www.w3.org/TR/pointerevents/
 * @see https://dvcs.w3.org/hg/pointerevents/raw-file/tip/pointerEvents.html
 * @see https://dvcs.w3.org/hg/webevents/raw-file/default/touchevents.html
 * @see http://msdn.microsoft.com/en-US/library/ie/hh673557.aspx
 * @see http://www.benalman.com/news/2010/03/jquery-special-events/
 * @see http://api.jquery.com/category/events/event-object/
 *
 * @modules pointerevents
 *
 * @author Kir Belevich <kir@soulshine.in>
 * @copyright Kir Belevich 2013
 * @license MIT
 * @version 0.1.0
 */
modules.define('jquery', function(provide, $) {

// nothing to do
if(window.navigator.pointerEnabled) {
    provide($);
    return;
}

// current events type and aliases
var current;

// touch
// https://github.com/ariya/phantomjs/issues/10375
if('ontouchstart' in window && !('_phantom' in window)) {
    current = {
        type : 'touch',
        enter : 'touchstart',
        over : 'touchstart',
        down : 'touchstart',
        move : 'touchmove',
        up : 'touchend',
        out : 'touchend',
        leave : 'touchend',
        cancel : 'touchcancel'
    };
// msPointer
} else if(window.navigator.msPointerEnabled) {
    current = {
        type : 'mspointer',
        enter : 'mouseenter', // :(
        over : 'MSPointerOver',
        down : 'MSPointerDown',
        move : 'MSPointerMove',
        up : 'MSPointerUp',
        out : 'MSPointerOut',
        leave : 'mouseleave', // :(
        cancel : 'MSPointerCancel'
    };
// mouse
} else {
    current = {
        type : 'mouse',
        enter : 'mouseenter',
        over : 'mouseover',
        down : 'mousedown',
        move : 'mousemove',
        up : 'mouseup',
        out : 'mouseout',
        leave : 'mouseleave'
    };
}

var isTouch = current.type === 'touch',
    isMouse = current.type === 'mouse';

/**
 * Mutate an argument event to PointerEvent.
 *
 * @param {Object} e current event
 * @param {String} type new pointerevent type
 */
function PointerEvent(e, type) {
    e.type = type;
    // do not do anything with multiple touch-events because of gestures
    if(!(type === 'touch' && e.originalEvent.changedTouches.length > 1)) {
        normalizeToJQueryEvent(e);
        extendToPointerEvent(e);
        $.extend(this, e);
    }
}

/**
 * Dispatch current event.
 *
 * @param {Element} target target element
 */
PointerEvent.prototype.dispatch = function(target) {
    this.type && ($.event.handle || $.event.dispatch).call(target, this);
    return this;
};

/**
 * Normalize only touch-event to jQuery event interface.
 *
 * @see http://api.jquery.com/category/events/event-object/
 *
 * @param {Object} e input event
 */
function normalizeToJQueryEvent(e) {
    if(!isTouch) return;

    var touchPoint = e.originalEvent.changedTouches[0];

    // keep all the properties normalized by jQuery
    e.clientX = touchPoint.clientX;
    e.clientY = touchPoint.clientY;
    e.pageX = touchPoint.pageX;
    e.pageY = touchPoint.pageY;
    e.screenX = touchPoint.screenX;
    e.screenY = touchPoint.screenY;
    e.layerX = e.originalEvent.layerX;
    e.layerY = e.originalEvent.layerY;
    e.offsetX = e.layerX - e.currentTarget.offsetLeft;
    e.offsetY = e.layerY - e.currentTarget.offsetTop;
    e.target = touchPoint.target;
    e.identifier = touchPoint.identifier;
}

/**
 * Extend event to match PointerEvent Interface.
 *
 * @see https://dvcs.w3.org/hg/pointerevents/raw-file/tip/pointerEvents.html#pointer-events-and-interfaces
 * @see https://dvcs.w3.org/hg/webevents/raw-file/default/touchevents.html
 * @param {Object} e input event
 */
function extendToPointerEvent(e) {
    e.width = e.width ||
        e.webkitRadiusX ||
        e.radiusX ||
        0;

    e.height = e.width ||
        e.webkitRadiusY ||
        e.radiusY ||
        0;

    // TODO: stupid Android somehow could send "force" > 1 ;(
    e.pressure = e.pressure ||
        e.mozPressure ||
        e.webkitForce ||
        e.force ||
        e.which && 0.5 ||
        0;

    e.tiltX = e.tiltX || 0;
    e.tiltY = e.tiltY || 0;
    e.pointerType = e.pointerType || current.type;

    // https://dvcs.w3.org/hg/pointerevents/raw-file/tip/pointerEvents.html#the-primary-pointer
    e.isPrimary = true;

    // "1" is always for mouse, need to +2 for touch which can start from "0"
    e.pointerId = e.identifier? e.identifier + 2 : 1;
}

function addSpecialEvent(eventType, extend) {
    var pointerEventType = 'pointer' + eventType,
        handlerFn = 'handler' + (isTouch? 'Touch' : 'NonTouch'),
        specialEvent = $.event.special[pointerEventType] = {
            setup : function() {
                $(this).on(current[eventType], specialEvent.handler);
            },

            teardown : function() {
                $(this).off(current[eventType], specialEvent.handler);
            },

            handler : function() {
                specialEvent[handlerFn].apply(this, arguments);
            },

            handlerTouch : function(e) {
                var pointerEvent = new PointerEvent(e, pointerEventType);
                pointerEvent.dispatch(pointerEvent.target);
            },

            handlerNonTouch : function(e) {
                new PointerEvent(e, pointerEventType).dispatch(this);
            }
        };

    extend && $.extend(specialEvent, extend(specialEvent, pointerEventType));
}

function extendHandlerTouchByElement(_, pointerEventType) {
    return {
        handlerTouch : function(e) {
            var pointerEvent = new PointerEvent(e, pointerEventType),
                target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY);
            pointerEvent.dispatch(target);
        }
    };
}

function pressAndReleaseHandlerStub(specialEvent, pointerEventType) {
    var eventTypeForMouse = current[pointerEventType === 'pointerpress'? 'down' : 'up'];
    return {
        setup : function() {
            isMouse?
                $(this).on(eventTypeForMouse, specialEvent.handlerMouse) :
                $(this)
                    .on(current.down, specialEvent.handlerNonMouseDown)
                    .on(current.move, specialEvent.handlerNonMouseMove)
                    .on(current.up, specialEvent.handlerNonMouseUp);
        },

        teardown : function() {
            isMouse?
                $(this).off(eventTypeForMouse, specialEvent.handlerMouse) :
                $(this)
                    .off(current.down, specialEvent.handlerNonMouseDown)
                    .off(current.move, specialEvent.handlerNonMouseMove)
                    .off(current.up, specialEvent.handlerNonMouseUp);
        },

        handlerNonMouseMove : function(e) {
            var data = specialEvent.data;
            if(Math.abs(e.clientX - data.clientX) > 5 ||
                Math.abs(e.clientY - data.clientY) > 5) {
                data.move = true;
            }
        },

        handlerMouse : function(e) {
            // only left mouse button
            e.which === 1 && new PointerEvent(e, pointerEventType).dispatch(this);
        }
    };
}

addSpecialEvent('enter');
addSpecialEvent('over');
addSpecialEvent('down');
addSpecialEvent('up', extendHandlerTouchByElement);
addSpecialEvent('out', extendHandlerTouchByElement);
addSpecialEvent('leave', extendHandlerTouchByElement);
addSpecialEvent('move', function(specialEvent) {
    return {
        setup : function() {
            isTouch && $(this).on(current.down, specialEvent.downHandler);
            $(this).on(current.move, specialEvent.moveHandler);
        },

        teardown : function() {
            isTouch && $(this).off(current.down, specialEvent.downHandler);
            $(this).off(current.move, specialEvent.moveHandler);
        },

        downHandler : function(e) {
            var pointerEvent = new PointerEvent(e, 'pointerdown');
            specialEvent.target = pointerEvent.target;
        },

        moveHandler : function(e) {
            var pointerEvent = new PointerEvent(e, 'pointermove');
            if(isTouch) {
                var newTarget = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY),
                    currentTarget = specialEvent.target;

                pointerEvent.dispatch(currentTarget);

                if(currentTarget !== newTarget) {
                    // out current target
                    pointerEvent = new PointerEvent(e, 'pointerout');
                    pointerEvent.dispatch(currentTarget);

                    // new target is not a child of the current -> leave current target
                    if(!currentTarget.contains(newTarget)) {
                        pointerEvent = new PointerEvent(e, 'pointerleave');
                        pointerEvent.dispatch(currentTarget);
                    }

                    // new target is not the parent of the current -> leave new target
                    if(!newTarget.contains(currentTarget)) {
                        pointerEvent = new PointerEvent(e, 'pointerenter');
                        pointerEvent.dispatch(newTarget);
                    }

                    // over new target
                    pointerEvent = new PointerEvent(e, 'pointerover');
                    pointerEvent.dispatch(newTarget);

                    // new target -> current target
                    specialEvent.target = newTarget;
                }
            } else {
                pointerEvent.dispatch(this);
            }
        }
    };
});

addSpecialEvent('press', function(specialEvent, pointerEventType) {
    return $.extend(
        pressAndReleaseHandlerStub(specialEvent, pointerEventType),
        {
            handlerNonMouseDown : function(e) {
                specialEvent.data = {
                    timer : (function() {
                        return setTimeout(function() {
                            if(!specialEvent.data.move) {
                                var pointerevent = new PointerEvent(e, pointerEventType);
                                pointerevent.dispatch(pointerevent.target);
                            }
                        }, 80);
                    })(),
                    clientX : e.clientX,
                    clientY : e.clientY
                };
            },

            handlerNonMouseUp : function() {
                clearTimeout(specialEvent.data.timer);
                delete specialEvent.data;
            }
        });
});

addSpecialEvent('release', function(specialEvent, pointerEventType) {
    return $.extend(
        pressAndReleaseHandlerStub(specialEvent, pointerEventType),
        {
            handlerNonMouseDown : function(e) {
                var data = specialEvent.data = {
                    timer : (function() {
                        return setTimeout(function() {
                            data.move || (data.pressed = true);
                        }, 80);
                    })(),
                    clientX : e.clientX,
                    clientY : e.clientY
                };
            },

            handlerNonMouseUp : function(e) {
                clearTimeout(specialEvent.data.timer);

                if(specialEvent.data.pressed) {
                    var pointerEvent = new PointerEvent(e, pointerEventType),
                        target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY);
                    pointerEvent.dispatch(target);
                }

                delete specialEvent.data;
            }
        });
});

provide($);

});
/* ../../libs/bem-core/common.blocks/jquery/__event/_type/jquery__event_type_pointer.js end */
;
/* ../../libs/bem-core/desktop.blocks/jquery/__event/_type/jquery__event_type_pointerclick.js begin */
/**
 * @modules jquery__event_type_pointerclick
 * @version 1.0.2
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 */

modules.define('jquery', function(provide, $) {

var event = $.event.special.pointerclick = {
        setup : function() {
            $(this).on('click', event.handler);
        },

        teardown : function() {
            $(this).off('click', event.handler);
        },

        handler : function(e) {
            if(!e.button) {
                e.type = 'pointerclick';
                $.event.dispatch.apply(this, arguments);
                e.type = 'click';
            }
        }
    };

provide($);

});
/* ../../libs/bem-core/desktop.blocks/jquery/__event/_type/jquery__event_type_pointerclick.js end */
;
(function(g) {

  var __xjst = (function(exports) {

     var __$ref={};function apply(ctx){try{return applyc(ctx||this,__$ref)}catch(e){(ctx||this).xjstContext=e;throw e}}exports.apply=apply;function applyc(__$ctx,__$ref){var __$t=__$ctx._mode;if(__$t==="content"){if(__$ctx.block==="ua"&&!__$ctx.elem){__$ctx.__$a=0;return[";(function(d,e,c,r){","e=d.documentElement;",'c="className";','r="replace";','e[c]=e[c][r](/(ua_js_)no/g,"$1yes");','if(d.compatMode!="CSS1Compat")','e[c]=e[c][r](/(ua_css_)standart/g,"$1quirks")',"})(document);"]}__$ctx.__$a=0;return __$ctx.ctx.content}else if(__$t==="bem"){if(__$ctx.block==="ua"&&!__$ctx.elem){__$ctx.__$a=0;return false}__$ctx.__$a=0;return undefined}else if(__$t==="tag"){if(__$ctx.block==="ua"&&!__$ctx.elem){__$ctx.__$a=0;return"script"}__$ctx.__$a=0;return undefined}else if(__$t==="js"){var __$t=__$ctx.block;if(__$t==="cell"){if(!__$ctx.elem){__$ctx.__$a=0;return true}}else if(__$t==="grid"){if(!__$ctx.elem){__$ctx.__$a=0;return true}}__$ctx.__$a=0;return undefined}else if(__$t==="mix"){__$ctx.__$a=0;return undefined}else if(__$t==="cls"){__$ctx.__$a=0;return undefined}else if(__$t==="attrs"){__$ctx.__$a=0;return undefined}else if(__$t==="default"){__$ctx.__$a=0;var __$r=__$b13(__$ctx,__$ref);if(__$r!==__$ref)return __$r}else if(__$t===""){if(__$ctx.ctx&&__$ctx.ctx.hasOwnProperty("_res")&&__$ctx.__$a!==1){__$ctx.__$a=0;var __$r=__$b14(__$ctx,__$ref);if(__$r!==__$ref)return __$r}if(__$ctx._.isSimple(__$ctx.ctx)){__$ctx.__$a=0;var __$r=__$b15(__$ctx,__$ref);if(__$r!==__$ref)return __$r}if(!__$ctx.ctx){__$ctx.__$a=0;var __$r=__$b16(__$ctx,__$ref);if(__$r!==__$ref)return __$r}if(__$ctx._.isArray(__$ctx.ctx)){__$ctx.__$a=0;var __$r=__$b17(__$ctx,__$ref);if(__$r!==__$ref)return __$r}__$ctx.__$a=0;var __$r=__$b18(__$ctx,__$ref);if(__$r!==__$ref)return __$r}__$ctx.__$a=0}[function(exports){var BEM_={},toString=Object.prototype.toString,isArray=Array.isArray||function(obj){return toString.call(obj)==="[object Array]"},SHORT_TAGS={area:1,base:1,br:1,col:1,command:1,embed:1,hr:1,img:1,input:1,keygen:1,link:1,meta:1,param:1,source:1,wbr:1};!function(BEM,undefined){var MOD_DELIM="_",ELEM_DELIM="__",NAME_PATTERN="[a-zA-Z0-9-]+";function buildModPostfix(modName,modVal,buffer){buffer.push(MOD_DELIM,modName);modVal!==true&&buffer.push(MOD_DELIM,modVal)}function buildBlockClass(name,modName,modVal,buffer){buffer.push(name);modVal&&buildModPostfix(modName,modVal,buffer)}function buildElemClass(block,name,modName,modVal,buffer){buildBlockClass(block,undefined,undefined,buffer);buffer.push(ELEM_DELIM,name);modVal&&buildModPostfix(modName,modVal,buffer)}BEM.INTERNAL={NAME_PATTERN:NAME_PATTERN,MOD_DELIM:MOD_DELIM,ELEM_DELIM:ELEM_DELIM,buildModPostfix:function(modName,modVal,buffer){var res=buffer||[];buildModPostfix(modName,modVal,res);return buffer?res:res.join("")},buildClass:function(block,elem,modName,modVal,buffer){var typeOfModName=typeof modName;if(typeOfModName==="string"||typeOfModName==="boolean"){var typeOfModVal=typeof modVal;if(typeOfModVal!=="string"&&typeOfModVal!=="boolean"){buffer=modVal;modVal=modName;modName=elem;elem=undefined}}else if(typeOfModName!=="undefined"){buffer=modName;modName=undefined}else if(elem&&typeof elem!=="string"){buffer=elem;elem=undefined}if(!(elem||modName||buffer)){return block}var res=buffer||[];elem?buildElemClass(block,elem,modName,modVal,res):buildBlockClass(block,modName,modVal,res);return buffer?res:res.join("")},buildModsClasses:function(block,elem,mods,buffer){var res=buffer||[];if(mods){var modName;for(modName in mods){if(!mods.hasOwnProperty(modName))continue;var modVal=mods[modName];if(modVal==null)continue;modVal=mods[modName];typeof modVal!=="boolean"&&(modVal+="");if(!modVal)continue;res.push(" ");if(elem){buildElemClass(block,elem,modName,modVal,res)}else{buildBlockClass(block,modName,modVal,res)}}}return buffer?res:res.join("")},buildClasses:function(block,elem,mods,buffer){var res=buffer||[];elem?buildElemClass(block,elem,undefined,undefined,res):buildBlockClass(block,undefined,undefined,res);this.buildModsClasses(block,elem,mods,buffer);return buffer?res:res.join("")}}}(BEM_);var ts={'"':"&quot;","&":"&amp;","<":"&lt;",">":"&gt;"},f=function(t){return ts[t]||t};var buildEscape=function(r){r=new RegExp(r,"g");return function(s){return(""+s).replace(r,f)}};function BEMContext(context,apply_){this.ctx=typeof context===null?"":context;this.apply=apply_;this._buf=[];this._=this;this._start=true;this._mode="";this._listLength=0;this._notNewList=false;this.position=0;this.block=undefined;this.elem=undefined;this.mods=undefined;this.elemMods=undefined}BEMContext.prototype.isArray=isArray;BEMContext.prototype.isSimple=function isSimple(obj){var t=typeof obj;return t==="string"||t==="number"||t==="boolean"};BEMContext.prototype.isShortTag=function isShortTag(t){return SHORT_TAGS.hasOwnProperty(t)};BEMContext.prototype.extend=function extend(o1,o2){if(!o1||!o2)return o1||o2;var res={},n;for(n in o1)o1.hasOwnProperty(n)&&(res[n]=o1[n]);for(n in o2)o2.hasOwnProperty(n)&&(res[n]=o2[n]);return res};var cnt=0,id=+new Date,expando="__"+id,get=function(){return"uniq"+id+ ++cnt};BEMContext.prototype.identify=function(obj,onlyGet){if(!obj)return get();if(onlyGet||obj[expando])return obj[expando];else return obj[expando]=get()};BEMContext.prototype.xmlEscape=buildEscape("[&<>]");BEMContext.prototype.attrEscape=buildEscape('["&<>]');BEMContext.prototype.BEM=BEM_;BEMContext.prototype.isFirst=function isFirst(){return this.position===1};BEMContext.prototype.isLast=function isLast(){return this.position===this._listLength};BEMContext.prototype.generateId=function generateId(){return this.identify(this.ctx)};var oldApply=exports.apply;exports.apply=BEMContext.apply=function _apply(context){var ctx=new BEMContext(context||this,oldApply);ctx.apply();return ctx._buf.join("")};BEMContext.prototype.reapply=BEMContext.apply}].forEach(function(fn){fn(exports,this)},{recordExtensions:function(ctx){ctx._mode=undefined;ctx._notNewList=undefined;ctx.position=undefined;ctx._listLength=undefined;ctx.ctx=undefined;ctx.block=undefined;ctx.elem=undefined;ctx.__$a=0;ctx._currBlock=undefined;ctx.mods=undefined;ctx.elemMods=undefined}});function __$b13(__$ctx,__$ref){__$ctx.__$a=0;var _this__$0=__$ctx,BEM___$1=_this__$0.BEM,v__$2=__$ctx.ctx,buf__$3=__$ctx._buf,tag__$4;var __$r__$5;var __$l14__$6=__$ctx._mode;__$ctx._mode="tag";__$r__$5=applyc(__$ctx,__$ref);__$ctx._mode=__$l14__$6;tag__$4=__$r__$5;typeof tag__$4!="undefined"||(tag__$4=v__$2.tag);typeof tag__$4!="undefined"||(tag__$4="div");if(tag__$4){var jsParams__$7,js__$8;if(__$ctx.block&&v__$2.js!==false){var __$r__$9;var __$l6__$10=__$ctx._mode;__$ctx._mode="js";__$r__$9=applyc(__$ctx,__$ref);__$ctx._mode=__$l6__$10;js__$8=__$r__$9;js__$8=js__$8?__$ctx._.extend(v__$2.js,js__$8===true?{}:js__$8):v__$2.js===true?{}:v__$2.js;js__$8&&((jsParams__$7={})[BEM___$1.INTERNAL.buildClass(__$ctx.block,v__$2.elem)]=js__$8)}buf__$3.push("<",tag__$4);var __$r__$12;var __$l7__$13=__$ctx._mode;__$ctx._mode="bem";__$r__$12=applyc(__$ctx,__$ref);__$ctx._mode=__$l7__$13;var isBEM__$11=__$r__$12;typeof isBEM__$11!="undefined"||(isBEM__$11=typeof v__$2.bem!="undefined"?v__$2.bem:v__$2.block||v__$2.elem);var __$r__$15;var __$l8__$16=__$ctx._mode;__$ctx._mode="cls";__$r__$15=applyc(__$ctx,__$ref);__$ctx._mode=__$l8__$16;var cls__$14=__$r__$15;cls__$14||(cls__$14=v__$2.cls);var addJSInitClass__$17=v__$2.block&&jsParams__$7;if(isBEM__$11||cls__$14){buf__$3.push(' class="');if(isBEM__$11){BEM___$1.INTERNAL.buildClasses(__$ctx.block,v__$2.elem,v__$2.elemMods||v__$2.mods,buf__$3);var __$r__$19;var __$l9__$20=__$ctx._mode;__$ctx._mode="mix";__$r__$19=applyc(__$ctx,__$ref);__$ctx._mode=__$l9__$20;var mix__$18=__$r__$19;v__$2.mix&&(mix__$18=mix__$18?mix__$18.concat(v__$2.mix):v__$2.mix);if(mix__$18){var visited__$21={};function visitedKey__$22(block,elem){return(block||"")+"__"+(elem||"")}visited__$21[visitedKey__$22(__$ctx.block,__$ctx.elem)]=true;if(!__$ctx._.isArray(mix__$18))mix__$18=[mix__$18];for(var i__$23=0;i__$23<mix__$18.length;i__$23++){var mixItem__$24=mix__$18[i__$23],hasItem__$25=mixItem__$24.block||mixItem__$24.elem,block__$26=mixItem__$24.block||mixItem__$24._block||_this__$0.block,elem__$27=mixItem__$24.elem||mixItem__$24._elem||_this__$0.elem;hasItem__$25&&buf__$3.push(" ");BEM___$1.INTERNAL[hasItem__$25?"buildClasses":"buildModsClasses"](block__$26,mixItem__$24.elem||mixItem__$24._elem||(mixItem__$24.block?undefined:_this__$0.elem),mixItem__$24.elemMods||mixItem__$24.mods,buf__$3);if(mixItem__$24.js){(jsParams__$7||(jsParams__$7={}))[BEM___$1.INTERNAL.buildClass(block__$26,mixItem__$24.elem)]=mixItem__$24.js===true?{}:mixItem__$24.js;addJSInitClass__$17||(addJSInitClass__$17=block__$26&&!mixItem__$24.elem)}if(hasItem__$25&&!visited__$21[visitedKey__$22(block__$26,elem__$27)]){visited__$21[visitedKey__$22(block__$26,elem__$27)]=true;var __$r__$29;var __$l10__$30=__$ctx._mode;__$ctx._mode="mix";var __$l11__$31=__$ctx.block;__$ctx.block=block__$26;var __$l12__$32=__$ctx.elem;__$ctx.elem=elem__$27;__$r__$29=applyc(__$ctx,__$ref);__$ctx._mode=__$l10__$30;__$ctx.block=__$l11__$31;__$ctx.elem=__$l12__$32;var nestedMix__$28=__$r__$29;if(nestedMix__$28){for(var j__$33=0;j__$33<nestedMix__$28.length;j__$33++){var nestedItem__$34=nestedMix__$28[j__$33];if(!nestedItem__$34.block&&!nestedItem__$34.elem||!visited__$21[visitedKey__$22(nestedItem__$34.block,nestedItem__$34.elem)]){nestedItem__$34._block=block__$26;nestedItem__$34._elem=elem__$27;mix__$18.splice(i__$23+1,0,nestedItem__$34)}}}}}}}cls__$14&&buf__$3.push(isBEM__$11?" ":"",cls__$14);addJSInitClass__$17&&buf__$3.push(" i-bem");buf__$3.push('"')}if(isBEM__$11&&jsParams__$7){buf__$3.push(' data-bem="',__$ctx._.attrEscape(JSON.stringify(jsParams__$7)),'"')}var __$r__$36;var __$l13__$37=__$ctx._mode;__$ctx._mode="attrs";__$r__$36=applyc(__$ctx,__$ref);__$ctx._mode=__$l13__$37;var attrs__$35=__$r__$36;attrs__$35=__$ctx._.extend(attrs__$35,v__$2.attrs);if(attrs__$35){var name__$38,attr__$39;for(name__$38 in attrs__$35){attr__$39=attrs__$35[name__$38];if(attr__$39===undefined)continue;buf__$3.push(" ",name__$38,'="',__$ctx._.attrEscape(__$ctx._.isSimple(attr__$39)?attr__$39:__$ctx.reapply(attr__$39)),'"')}}}if(__$ctx._.isShortTag(tag__$4)){buf__$3.push("/>")}else{tag__$4&&buf__$3.push(">");var __$r__$41;var __$l0__$42=__$ctx._mode;__$ctx._mode="content";__$r__$41=applyc(__$ctx,__$ref);__$ctx._mode=__$l0__$42;var content__$40=__$r__$41;if(content__$40||content__$40===0){var isBEM__$11=__$ctx.block||__$ctx.elem;var __$r__$43;var __$l1__$44=__$ctx._mode;__$ctx._mode="";var __$l2__$45=__$ctx._notNewList;__$ctx._notNewList=false;var __$l3__$46=__$ctx.position;__$ctx.position=isBEM__$11?1:__$ctx.position;var __$l4__$47=__$ctx._listLength;__$ctx._listLength=isBEM__$11?1:__$ctx._listLength;var __$l5__$48=__$ctx.ctx;__$ctx.ctx=content__$40;__$r__$43=applyc(__$ctx,__$ref);__$ctx._mode=__$l1__$44;__$ctx._notNewList=__$l2__$45;__$ctx.position=__$l3__$46;__$ctx._listLength=__$l4__$47;__$ctx.ctx=__$l5__$48}tag__$4&&buf__$3.push("</",tag__$4,">")}return}function __$b14(__$ctx,__$ref){__$ctx.__$a=0;var __$r__$49;var __$l0__$50=__$ctx._mode;__$ctx._mode="";var __$l1__$51=__$ctx.ctx;__$ctx.ctx=__$ctx.ctx._res;var __$r__$52;__$ctx.__$a=1;__$r__$52=applyc(__$ctx,__$ref);__$r__$49=__$r__$52;__$ctx._mode=__$l0__$50;__$ctx.ctx=__$l1__$51;return}function __$b15(__$ctx,__$ref){__$ctx.__$a=0;__$ctx._listLength--;var ctx__$53=__$ctx.ctx;(ctx__$53&&ctx__$53!==true||ctx__$53===0)&&__$ctx._buf.push(ctx__$53);return}function __$b16(__$ctx,__$ref){__$ctx.__$a=0;__$ctx._listLength--;return}function __$b17(__$ctx,__$ref){__$ctx.__$a=0;var v__$54=__$ctx.ctx,l__$55=v__$54.length,i__$56=0,prevPos__$57=__$ctx.position,prevNotNewList__$58=__$ctx._notNewList;if(prevNotNewList__$58){__$ctx._listLength+=l__$55-1}else{__$ctx.position=0;__$ctx._listLength=l__$55}__$ctx._notNewList=true;while(i__$56<l__$55)!function(){var __$r__$59;var __$l0__$60=__$ctx.ctx;__$ctx.ctx=v__$54[i__$56++];__$r__$59=applyc(__$ctx,__$ref);__$ctx.ctx=__$l0__$60;return __$r__$59}();prevNotNewList__$58||(__$ctx.position=prevPos__$57);return}function __$b18(__$ctx,__$ref){__$ctx.__$a=0;var vBlock__$61=__$ctx.ctx.block,vElem__$62=__$ctx.ctx.elem,block__$63=__$ctx._currBlock||__$ctx.block;__$ctx.ctx||(__$ctx.ctx={});var __$r__$64;var __$l0__$65=__$ctx._mode;__$ctx._mode="default";var __$l1__$66=__$ctx.block;__$ctx.block=vBlock__$61||(vElem__$62?block__$63:undefined);var __$l2__$67=__$ctx._currBlock;__$ctx._currBlock=vBlock__$61||vElem__$62?undefined:block__$63;var __$l3__$68=__$ctx.elem;__$ctx.elem=__$ctx.ctx.elem;var __$l4__$69=__$ctx.mods;__$ctx.mods=(vBlock__$61?__$ctx.ctx.mods:__$ctx.mods)||{};var __$l5__$70=__$ctx.elemMods;__$ctx.elemMods=__$ctx.ctx.elemMods||{};__$ctx.block||__$ctx.elem?__$ctx.position=(__$ctx.position||0)+1:__$ctx._listLength--;applyc(__$ctx,__$ref);__$r__$64=undefined;__$ctx._mode=__$l0__$65;__$ctx.block=__$l1__$66;__$ctx._currBlock=__$l2__$67;__$ctx.elem=__$l3__$68;__$ctx.mods=__$l4__$69;__$ctx.elemMods=__$l5__$70;return};
     return exports;
  })({});
  var defineAsGlobal = true;
  if(typeof exports === "object") {
    exports["BEMHTML"] = __xjst;
    defineAsGlobal = false;
  }
  if(typeof modules === "object") {
    modules.define("BEMHTML", function(provide) { provide(__xjst) });
    defineAsGlobal = false;
  }
  defineAsGlobal && (g["BEMHTML"] = __xjst);
})(this);