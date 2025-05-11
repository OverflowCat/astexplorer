(function (mod) {
  if (typeof exports == 'object' && typeof module == 'object')
    // CommonJS
    mod(require('codemirror/lib/codemirror'));
  else if (typeof define == 'function' && define.amd)
    // AMD
    define(['codemirror/lib/codemirror'], mod);
  // Plain browser env
  else mod(CodeMirror);
})(function (CodeMirror) {
  'use strict';

  function wordSet(words) {
    var set = {};
    for (var i = 0; i < words.length; i++) set[words[i]] = true;
    return set;
  }

  // Cangjie Keywords -  Adapted from tmLanguage scope "keyword.control.Cangjie"
  var keywords = wordSet([
    'VArray',
    'const',
    'differentiable',
    'grad',
    'vjp',
    'valWithGrad',
    'adjoint',
    'adjointOf',
    'when',
    'except',
    'include',
    'primal',
    'stage',
    'main',
    'mut',
    'prop',
    'redef',
    'struct',
    'enum',
    'package',
    'import',
    'class',
    'interface',
    'extend',
    'func',
    'let',
    'var',
    'sealed',
    'type',
    'init',
    'this',
    'super',
    'if',
    'else',
    'case',
    'try',
    'catch',
    'finally',
    'for',
    'do',
    'while',
    'throw',
    'return',
    'continue',
    'break',
    'is',
    'as',
    'in',
    '!in',
    'match',
    'where',
    'spawn',
    'synchronized',
    'macro',
    'quote',
    'static',
    'public',
    'internal',
    'private',
    'protected',
    'external',
    'override',
    'abstract',
    'open',
    'operator',
    'foreign',
    'inout',
  ]);

  // Cangjie Atoms/Literals - Adapted from tmLanguage "false", "true", "Nothing", "This"
  var atoms = wordSet([
    'true',
    'false',
    'nil',
    'self',
    'super',
    '_',
    'Nothing',
    'This',
  ]); // Added nil, self, super, _ from Swift for robustness

  // Cangjie Built-in Types - Adapted from tmLanguage (IntNative, Bool, String, etc.)
  var types = wordSet([
    'IntNative',
    'UIntNative',
    'Int8',
    'Int16',
    'Int32',
    'Int64',
    'UInt8',
    'UInt16',
    'UInt32',
    'UInt64',
    'Float16',
    'Float32',
    'Float64',
    'Rune',
    'Bool',
    'Unit',
    'String',
    'Option',
    // VArray is a keyword for declaration, but also a type. Consider how to handle.
  ]);

  // Defining keywords for context (e.g., for highlighting definitions)
  var definingKeywords = wordSet([
    'var',
    'let',
    'class',
    'struct',
    'enum',
    'interface',
    'extend',
    'func',
    'type',
    'package',
    'import',
    'init',
    'macro',
    'operator',
  ]);

  // Operators - Extended from tmLanguage and common usage
  var operators = /^(?:[+\-*/%=\お願い&<>~^?!|]|<<|>>|\*\*|=>|->|<=|>=|==|!=|&&|\|\||\.{2,3})/; // Added common multi-char ops
  var punc = /[\[\]{};,:().`]/; // Added ` for quoted identifiers

  // Regexes for numbers - adapted from tmLanguage constant.numeric.*
  var binary = /^0[bB][01](?:[01_]*[01])?(u8|u16|u32|u64|i8|i16|i32|i64)?/i;
  var octal = /^0[oO][0-7](?:[0-7_]*[0-7])?(u8|u16|u32|u64|i8|i16|i32|i64)?/i;
  // Adjusted decimal and hex to be more robust like CodeMirror's general approach
  var hexadecimal = /^0[xX](?:[0-9a-fA-F_]+)?(?:(?:\.[0-9a-fA-F_]+)?(?:[Pp][+\-]?\d+)?)?(u8|u16|u32|u64|i8|i16|i32|i64)?/i;
  var decimal = /^(?:(?:\d+(?:_\d+)*)?\.(?:\d+(?:_\d+)*)(?:[eE][+\-]?\d+)?|(?:\d+(?:_\d+)*)\.(?:[eE][+\-]?\d+)?|(?:\d+(?:_\d+)*)(?:[eE][+\-]?\d+)|(?:\d+(?:_\d+)*))(f16|f32|f64)?/i;
  var integer = /^\d+(?:_\d+)*(u8|u16|u32|u64|i8|i16|i32|i64)?/i;

  // Unicode identifier (approximated, full XID_Start/Continue is complex in JS regex pre-ES6 \p)
  // Using \p for broader Unicode support, assuming modern JS environment for CodeMirror
  // \p{L} for any letter, \p{N} for any number, \p{Pc} for connector punctuation (like underscore)
  // \p{Mn} for non-spacing marks, \p{Mc} for spacing combining marks
  var identifierChar = /[_\p{L}\p{N}\p{Pc}\p{Mn}\p{Mc}$]/u;
  var identifier = /^(?:`[^`\\]*(?:\\.[^`\\]*)*`|(?:\$?\p{XID_Start}|_)(?:\p{XID_Continue}|[\$])*)/u;
  var property = /^\.(?:`[^`\\]*(?:\\.[^`\\]*)*`|(?:\$?\p{XID_Start}|_)(?:\p{XID_Continue}|[\$])*)/u;

  // Attributes / Macros (e.g., @Main)
  var attribute = /^@(?:`[^`\\]*(?:\\.[^`\\]*)*`|(?:\$?\p{XID_Start}|_)(?:\p{XID_Continue}|[\$])*)/u;

  // Raw/Origin strings: #"..."#, ##"..."##
  var rawStringOpen = /^([rJb]?)(#{1,})"/; // captures prefix, hashes, and quote

  function tokenBase(stream, state, prev) {
    if (stream.sol()) state.indented = stream.indentation();
    if (stream.eatSpace()) return null;

    var ch = stream.peek();

    // Comments
    if (ch == '/') {
      if (stream.match('//')) {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.match('/*')) {
        state.tokenize.push(tokenComment);
        return tokenComment(stream, state);
      }
    }

    // Attributes / Macros
    if (stream.match(attribute)) return 'attribute'; // "meta" or "attribute" are common CM styles

    // Strings
    var rawMatch = stream.match(rawStringOpen);
    if (rawMatch) {
      var quoteType = rawMatch[2] + '"'; // e.g., #" or ##"
      var tokenize = tokenString(quoteType, rawMatch[1] === 'r'); // rawMatch[1] is r, J or b
      state.tokenize.push(tokenize);
      return tokenize(stream, state);
    }
    if (stream.match(/^(?:[rJb]?)"{3}/)) {
      state.tokenize.push(tokenString('"""', stream.current()[0] === 'r'));
      return state.tokenize[state.tokenize.length - 1](stream, state);
    }
    if (stream.match(/^(?:[rJb]?)"""/)) {
      // Multiline
      var tokenize = tokenString('"""', stream.current().startsWith('r'));
      state.tokenize.push(tokenize);
      return tokenize(stream, state);
    }
    if (stream.match(/^(?:[rJb]?)"/)) {
      // Single line double quote
      var tokenize = tokenString('"', stream.current().startsWith('r'));
      state.tokenize.push(tokenize);
      return tokenize(stream, state);
    }
    if (stream.match(/^(?:[rJb]?)"{3}/)) {
      // Multiline triple quote
      state.tokenize.push(tokenString('"""', stream.current()[0] === 'r'));
      return state.tokenize[state.tokenize.length - 1](stream, state);
    }
    if (stream.match(/^(?:[rJb]?)'/)) {
      // Single quote
      var tokenize = tokenString("'", stream.current().startsWith('r'));
      state.tokenize.push(tokenize);
      return tokenize(stream, state);
    }

    // Numbers
    if (stream.match(binary)) return 'number';
    if (stream.match(octal)) return 'number';
    if (stream.match(hexadecimal)) return 'number';
    if (stream.match(decimal)) return 'number';
    if (stream.match(integer)) return 'number';

    // Property access
    if (stream.match(property)) return 'property';

    // Operators and Punctuation
    if (stream.match(operators)) return 'operator';
    if (stream.match(punc)) return 'punctuation';

    // Identifiers
    if (stream.match(identifier)) {
      var ident = stream.current();
      if (atoms.hasOwnProperty(ident)) return 'atom';
      if (types.hasOwnProperty(ident)) return 'variable-2'; // CM style for types
      if (keywords.hasOwnProperty(ident)) {
        if (definingKeywords.hasOwnProperty(ident)) state.prev = 'define';
        // Special handling for import/package for qualified names
        if (ident === 'import' || ident === 'package') {
          state.tokenize.push(tokenQualifiedName);
        }
        if (ident === 'quote') {
          // quote( ... )
          if (stream.match(/\s*\(/, false)) {
            // Check for opening parenthesis without consuming
            state.tokenize.push(tokenQuoteContent);
          }
        }
        return 'keyword';
      }
      if (prev == 'define') return 'def';
      return 'variable';
    }

    stream.next();
    return null; // Unknown
  }

  function tokenComment(stream, state) {
    var maybeEnd = false,
      ch;
    while ((ch = stream.next())) {
      if (ch == '/' && maybeEnd) {
        state.tokenize.pop();
        break;
      }
      maybeEnd = ch == '*';
      // Support nested comments
      if (ch == '/' && stream.eat('*')) {
        state.tokenize.push(tokenComment);
      }
    }
    return 'comment';
  }

  function tokenString(quote, isRaw) {
    return function (stream, state) {
      var escaped = false,
        ch;
      while ((ch = stream.next()) != null) {
        if (
          ch == quote.charAt(0) &&
          !escaped &&
          (quote.length == 1 || stream.match(quote.substring(1)))
        ) {
          state.tokenize.pop();
          break;
        }
        if (!isRaw && ch == '$' && !escaped && stream.eat('{')) {
          // String interpolation ${...}
          state.tokenize.push(tokenInterpolation);
          return 'string'; // Return string for the part before interpolation
        }
        escaped = !isRaw && !escaped && ch == '\\';
      }
      if (escaped && !isRaw) {
        // In case the string ends with a backslash
      }
      return 'string';
    };
  }

  function tokenInterpolation(stream, state) {
    // Tokenize inside ${...}
    // This is a simplified version; a full expression parser would be more complex.
    var depth = 0;
    var style = tokenBase(stream, state, state.prev);
    if (stream.current() === '{') {
      // This should have been eaten by the caller
      // no op
    } else if (stream.current() === '}') {
      if (depth === 0) {
        state.tokenize.pop();
        return state.tokenize[state.tokenize.length - 1](stream, state); // Resume string tokenizing
      } else {
        // Handle nested braces if necessary, though simple interpolation usually doesn't have them
      }
    }
    return style;
  }

  function tokenQuoteContent(stream, state) {
    // For quote(...) structure. Treats content as somewhat literal until matching ')'
    var parenDepth = 0;
    if (stream.peek() === '(') {
      // The opening '('
      stream.next();
      parenDepth++;
      return 'punctuation';
    }
    while (!stream.eol()) {
      var ch = stream.next();
      if (ch === '(') {
        parenDepth++;
      } else if (ch === ')') {
        parenDepth--;
        if (parenDepth < 0) {
          // Should not happen if initial ( was matched
          state.tokenize.pop();
          return 'keyword'; // for the 'quote' itself perhaps, or "punctuation" for ')'
        }
        if (parenDepth === 0) {
          state.tokenize.pop();
          return 'punctuation'; // The closing ')'
        }
      }
    }
    // If EOL is reached within quote, it continues.
    // The tmLanguage implies it's mostly string-like inside.
    return 'string'; // Or a more specific style for quote content
  }

  function tokenQualifiedName(stream, state) {
    // For tokenizing names after 'import' or 'package'
    // e.g., foo.bar.Baz or foo.bar.*
    stream.eatWhile(/[\w_`]/); // Eat the first part of the name
    var cur = stream.current();
    if (types.hasOwnProperty(cur)) state.prev = 'define';
    // Or some other context
    else state.prev = null;

    if (stream.peek() == '.') {
      stream.next(); // Eat the dot
      return 'punctuation';
    }
    if (stream.peek() == '*') {
      stream.next(); // Eat the wildcard
      state.tokenize.pop(); // Done with qualified name
      return 'variable-2'; // Or some other style for wildcard
    }
    // If it's neither dot nor wildcard, qualified name sequence ends
    state.tokenize.pop();
    if (cur.length > 0) return 'variable'; // Or "namespace" if you add such a style
    return null; // Should have consumed something
  }

  function Context(prev, align, indented) {
    this.prev = prev;
    this.align = align;
    this.indented = indented;
  }

  function pushContext(state, stream) {
    var align = stream.match(/^\s*($|\/[\/\*])/, false)
      ? null
      : stream.column() + 1;
    state.context = new Context(state.context, align, state.indented);
  }

  function popContext(state) {
    if (state.context) {
      state.indented = state.context.indented;
      state.context = state.context.prev;
    }
  }

  CodeMirror.defineMode('cangjie', function (config) {
    return {
      startState: function () {
        return {
          prev: null,
          context: null,
          indented: 0,
          tokenize: [], // Stack of tokenizers
        };
      },

      token: function (stream, state) {
        var prev = state.prev;
        state.prev = null;
        var tokenize = state.tokenize[state.tokenize.length - 1] || tokenBase;
        var style = tokenize(stream, state, prev);

        if (!style || style == 'comment') state.prev = prev;
        else if (!state.prev) state.prev = style;

        if (style == 'punctuation') {
          var bracket = /[\(\[\{]|([\]\)\}])/.exec(stream.current());
          if (bracket) (bracket[1] ? popContext : pushContext)(state, stream);
        }
        return style;
      },

      indent: function (state, textAfter) {
        var cx = state.context;
        if (!cx) return 0;
        var closing = /^[\]\}\)]/.test(textAfter);
        if (cx.align != null) return cx.align - (closing ? 1 : 0);
        return cx.indented + (closing ? 0 : config.indentUnit);
      },

      electricInput: /^\s*[\)\}\]]$/,
      lineComment: '//',
      blockCommentStart: '/*',
      blockCommentEnd: '*/',
      fold: 'brace', // For folding based on braces
      closeBrackets: '()[]{}\'\'""``', // Auto-close pairs
    };
  });

  CodeMirror.defineMIME('text/x-cangjie', 'cangjie');
});
