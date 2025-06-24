class HTMLMetaParser {
    constructor() {
        this.metaCommands = [];
        this.errors = [];

        this.current_pos = 0;
        this.result = [];
        this.ctx = [];
        this.answer = [];
    }

    /**
     * HTMLファイルの内容をパースしてメタ言語コマンドを抽出
     * @param {string} htmlContent - HTMLファイルの内容
     * @returns {Object} パース結果
     */
    parse(htmlContent) {
        this.metaCommands = [];
        this.errors = [];

        this.current_pos = 0;

        try {
            // メタコマンドを抽出
            this.extractMetaComments(htmlContent);
            
            // 構造を解析してネスト関係を構築
            this.buildNestStructure();

            return {
                success: true,
                metaCommands: this.metaCommands,
                errors: this.errors
            };
        } catch (error) {
            this.errors.push(`Parse error: ${error.message}`);
            return {
                success: false,
                metaCommands: this.metaCommands,
                errors: this.errors
            };
        }
    }

    /**
     * HTMLコメント内のメタコマンドを抽出
     */
    extractMetaComments(content) {
        // HTMLコメント内のmetaコマンドを検索（開始タグと終了タグの両方に対応）
        const htmlCommentPattern = /[ \t]*\/?\/?\*?[ \t]*<!--\s*(\/?\s*meta\[.*?\].*?)-->[^\r\n]*(?:\r\n|\r|\n)?/gi;
        //上記と同じだが別途作成が必要（内部状態を持っている？）
        const htmlCommentPattern2 = /[ \t]*\/?\/?\*?[ \t]*<!--\s*(\/?\s*meta\[.*?\].*?)-->[^\r\n]*(?:\r\n|\r|\n)?/gi;
        let match;
        
        // while ((match = htmlCommentPattern.exec(content)) !== null) {
        for (const match of content.matchAll(htmlCommentPattern)) {

            // console.log(match[1]);
            let text = content.substring(this.current_pos, match.index);
            text = text.replace(htmlCommentPattern2, '');
            // console.log(JSON.stringify(text));//textNode抽出の一次的部分
            if (text!==""){
                this.metaCommands.push({
                    type:"textNode",
                    command: "textNode",
                    attributes: {},
                    raw: text
                });
            }
            let context = 'html';
            if ( match[1].indexOf("//")!==-1)
                context = 'javascript';
            else if (match[1].indexOf("/*")!==-1)
                context = 'css';

            console.log(match[1].trim());
            const command = this.parseMetaCommand(match[1].trim(), match.index, context);
            if (command) {
                this.metaCommands.push(command);
                this.current_pos=match.index;
            }
        }

        const text = content.substring(this.current_pos,content.length).replace(htmlCommentPattern2, '');
        this.metaCommands.push({
            type:"textNode",
            command: "textNode",
            raw: text
        });
    }

    /**
     * メタコマンドをパースして構造化されたオブジェクトに変換
     */
    parseMetaCommand(commandText, position, context) {
        try {
            // 自己完結型かクローズタグかを判定
            const isSelfClosing = commandText.endsWith('/');// || commandText.includes('/-->');
            const isCloseTag = commandText.startsWith('/meta[');

            if (isCloseTag) {
                // クローズタグの処理
                const closeMatch = commandText.match(/^\/meta\[([^\]]+)\]/);
                // console.log(closeMatch);
                if (closeMatch) {
                    return {
                        type: 'close',
                        command: closeMatch[1],
                        raw: commandText
                    };
                }
            } else {
                // 開始タグまたは自己完結タグの処理
                const openMatch = commandText.match(/^meta\[([^\]]+)\](?::\s*(.*))?/);
                if (openMatch) {
                    const command = openMatch[1].replace('/', ''); // 自己完結型の/を除去
                    const attributesPart = openMatch[2] || '';
                    
                    const attributes = this.parseAttributes(attributesPart);

                    return {
                        type: isSelfClosing ? 'self-closing' : 'open',
                        command: command,
                        attributes: attributes,
                        raw: commandText
                    };
                }
            }

            this.errors.push(`Failed to parse command: ${commandText}`);
            return null;
        } catch (error) {
            this.errors.push(`Error parsing command "${commandText}": ${error.message}`);
            return null;
        }
    }

    /**
     * 属性文字列をパースしてオブジェクトに変換
     */
    parseAttributes(attributeString) {
        if (!attributeString.trim()) return {};

        const attributes = {};
        
        // 属性のパターンをマッチング
        const attrPattern = /(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)' |\[((?:[^\]\\]|\\.)*)\]|([^\s]+))/g;

        let match;

        while ((match = attrPattern.exec(attributeString)) !== null) {
            const key = match[1];
            let value = match[2] || match[3] || match[4] || match[5];
            value = value.replace(/\\/g, '');

            // 配列形式の値を処理
            if (match[4]) {
                value = {};
                try {

                    // シングルクォートは無効
                    // JSON.parse("['a','b']"); // エラー！
                    // ダブルクォートが必要
                    // JSON.parse('["a","b"]'); // ['a', 'b']
                    // const escapedStr = match[4].replaceAll("\\","\\\\");
                    const escapedStr = match[4].replace(/\\([^"])/g, '$1');
                    // console.log(`[${escapedStr}]`);
                    value = JSON.parse(`[${escapedStr}]`);
                    // console.log(value);
                }
                catch (e) {
                }
            }
            console.log(key,"=",value);

            if (key==="p" && !isNaN(value) && value !== ''){
                value = parseFloat(value);
            }

            attributes[key] = value;
        }

        return attributes;
    }

    /**
     * ネスト構造を構築
     */
    buildNestStructure() {
        const stack = [];
        const structuredCommands = [];

        for (const command of this.metaCommands) {
            if (command.type === 'open') {
                // 子要素を格納する配列を初期化
                command.children = [];
                command.parent = stack.length > 0 ? stack[stack.length - 1] : null;
                
                if (command.parent) {
                    command.parent.children.push(command);
                } else {
                    structuredCommands.push(command);
                }
                
                stack.push(command);
            } else if (command.type === 'close') {
                // スタックから対応する開始タグを探す
                let found = false;
                for (let i = stack.length - 1; i >= 0; i--) {
                    if (stack[i].command === command.command) {
                        stack[i].closeTag = command;
                        stack.splice(i, 1);
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    this.errors.push(`No matching open tag for close tag: ${command.command}`);
                }
            } else if (command.type === 'self-closing') {
                // 自己完結型
                command.parent = stack.length > 0 ? stack[stack.length - 1] : null;
                
                if (command.parent) {
                    command.parent.children.push(command);
                } else {
                    structuredCommands.push(command);
                }
            } else if (command.type === 'textNode') {
                // 自己完結型
                command.parent = stack.length > 0 ? stack[stack.length - 1] : null;
                
                if (command.parent) {
                    command.parent.children.push(command);
                } else {
                    structuredCommands.push(command);
                }
            }

        }

        // 未閉じのタグをチェック
        if (stack.length > 0) {
            for (const unclosed of stack) {
                this.errors.push(`Unclosed tag: ${unclosed.command}`);
            }
        }

        this.metaCommands = structuredCommands;
    }

    /**
     * パース結果を見やすい形式で表示
     */
    printStructure(commands = this.metaCommands, indent = 0) {
        const result = [];
        const spaces = '  '.repeat(indent);

        for (const cmd of commands) {
            let line = `${spaces}${cmd.command}`;
            
            if (Object.keys(cmd.attributes || {}).length > 0) {
                line += `: ${JSON.stringify(cmd.attributes)}`;
            }
            
            line += ` (${cmd.type}, ${cmd.context})`;
            result.push(line);

            if (cmd.children && cmd.children.length > 0) {
                result.push(...this.printStructure(cmd.children, indent + 1));
            }
        }

        return result;
    }

    /**
     * 
     */
    printQuiz(random_seed) {

        Math.seedrandom(random_seed);

        this.result = [];
        this.ctx = [];
        this.render();

        let originalHtml="";
        let quizInputHtml="";

        originalHtml = this.result.join("").replace(/\{@([^@]*)@\}/g, '$1');

        quizInputHtml = this.result.join("").replace(/&/g, '&amp;')
                                        .replace(/</g, '&lt;')
                                        .replace(/>/g, '&gt;');

        quizInputHtml = quizInputHtml.replace(/\{@([^@]*)@\}/g, (match, answer) => {
            const width = Math.floor(answer.length*1.2+2);
            answer = answer.replaceAll('"','&quot;');
            return `<input type="text" data-answer="${answer}" style="width:${width}ch;">`
        });

        // console.log(quizInputHtml);

        return [originalHtml, quizInputHtml];
    }  

    /**
     * 
     */
    render(commands = this.metaCommands){
        for (const cmd of commands) {
            if (cmd.command === 'textNode'){

                let html = cmd.raw;
                //metaタグは，ツリーの先頭から順番に反映させていく
                for (const ctx of this.ctx){
                    html = this.modify(html, ctx);                    
                }
                if (html && html!=="")
                    this.result.push(html);
            }
            else {
                if (cmd.command === 'select'){

                    if (cmd.children && cmd.children.length > 0){
                        const optionItems = cmd.children.filter(item => item.command === "option");

                        if (optionItems.length>0){
                            cmd.rand = Math.random();
                            const child = optionItems[Math.floor(cmd.rand * optionItems.length)];

                            if (child.children && child.children.length > 0){
                                this.render(child.children);
                            }
                        }
                    }
                }
                else if (cmd.command === 'option'){
                    console.log("option!!");
                }
                else if (cmd.command === 'flip') {
                    if (!('p' in cmd.attributes))
                        cmd.attributes.p = 0.5;

                    if (!('rand' in cmd))
                        cmd.rand = Math.random();
            
                    if (!(cmd.children && cmd.children.length > 0))
                        return;

                    const ele_array = cmd.children.filter(item => item.command === "element");
                    if (!(ele_array.length>0))
                        return;

                    if (cmd.rand<cmd.attributes.p){
                        for (let i=ele_array.length-1; i>=0; i--){
                            const child = ele_array[i];
                            if (!(child.children && child.children.length > 0))
                                break;

                            this.render(child.children);
                        }
                    }
                    else{
                        for (let i=0; i<ele_array.length; i++){
                            const child = ele_array[i];
                            if (!(child.children && child.children.length > 0))
                                break;

                            this.render(child.children);
                        }
                    }
                }
                else if (cmd.command === 'element'){
                    console.log("element!!");
                }
                else if (cmd.command === 'includeBlock'){
                    if (!('rand' in cmd))
                        cmd.rand = Math.random();

                    if (cmd.rand<cmd.attributes.p){
                        if (cmd.children && cmd.children.length > 0){
                                this.render(cmd.children);
                        }
                    }
                }
                else {
                    this.ctx.push(cmd);

                    if (cmd.children && cmd.children.length > 0)
                        this.render(cmd.children);

                    this.ctx.pop();
                }
            }
        }
    }

    
    /**
     * 
     */
    modify(html, ctx){

        if (!html)
            return "";

        function _changeToInput(html, target, answer, wordMode){

            if (wordMode){
                return _replaceWord(html, target, `{@${answer}@}`);
            }
            else {
                if (!target.includes("\\"))
                    target = _escapeRegex(target);

                return html.replace(
                    new RegExp(`${target}`, 'g'), 
                    `{@${answer}@}`
                );
            }
        }

        function _replaceWord(html, key, replacement) {
            // 単語境界を使って完全一致のみ置換
            return html.replace(new RegExp(`\\b${_escapeRegex(key)}\\b`, 'g'), replacement);
        }

        function _escapeRegex(string) {
           if (typeof string === 'string')
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
           else
                return string;
        }

        function _prob_process(){
            if (!('p' in ctx.attributes)){
                ctx.attributes.p = 1.0;
            }

            if (!('exec_rand' in ctx))
                ctx.exec_rand = Math.random();

            if (!('select_rand' in ctx))
                ctx.select_rand = Math.random();
        }

        if (ctx.command==="replace"){
            _prob_process();
            if (ctx.exec_rand>=ctx.attributes.p)
                return html;

            let replacement = ctx.attributes.with[Math.floor(ctx.select_rand*ctx.attributes.with.length)];
            let target = ctx.attributes.target;

            if (typeof target === "string"){
               return html.replaceAll(target, replacement);
            }
            else if (Array.isArray(target)){
                for (const e of target){
                    if (typeof e === "string"){
                        html = html.replaceAll(e, replacement);
                    }
                }
            }
            return html;
        }
        else if (ctx.command==="replaceWord"){
            _prob_process();
            if (ctx.exec_rand>=ctx.attributes.p)
                return html;

            let replacement = ctx.attributes.with[Math.floor(ctx.select_rand*ctx.attributes.with.length)];
            let target = ctx.attributes.target;

            if (typeof target === "string")
               return _replaceWord(html, target, replacement);
            else if (Array.isArray(target)){
                for (const e of target){
                    if (typeof e === "string"){
                        html = _replaceWord(html, e, replacement);
                    }
                }
            }
            return html;
        }
        else if (ctx.command==="blankWord"){
            _prob_process();
            if (ctx.exec_rand>=ctx.attributes.p)
                return html;

            let target = ctx.attributes.candidates[Math.floor(ctx.select_rand*ctx.attributes.candidates.length)];

            if (typeof target === "string")
               return _changeToInput(html, target, target, true);
            else if (Array.isArray(target)){
                for (const e in target){
                    if (typeof e === "string")
                        html = _changeToInput(html, e, target, true);
                }
            }
            return html;
        }
        else if (ctx.command==="blank"){
            _prob_process();
            if (ctx.exec_rand>=ctx.attributes.p)
                return html;

            let target = ctx.attributes.candidates[Math.floor(ctx.select_rand*ctx.attributes.candidates.length)];

            if (typeof target === "string")
               return _changeToInput(html, target, target, false);
            else if (Array.isArray(target)){
                for (const e in target){
                    if (typeof e === "string")
                        html = _changeToInput(html, e, target, false);
                }
            }
            return html;
        }
        else if (ctx.command==="replaceAndBlankWord"){
            _prob_process();
            if (ctx.exec_rand>=ctx.attributes.p)
                return html;

            let replacement = ctx.attributes.with[Math.floor(ctx.select_rand*ctx.attributes.with.length)];
            let target = ctx.attributes.target;

            if (typeof target === "string")
               return _changeToInput(html, target, replacement, true);
            else if (Array.isArray(target)){
                for (const e in target){
                    if (typeof e === "string")
                        html = _changeToInput(html, e, replacement, true);
                }
            }
            return html;
        }
        else if (ctx.command==="replaceAndBlank"){
            _prob_process();
            if (ctx.exec_rand>=ctx.attributes.p)
                return html;

            let replacement = ctx.attributes.with[Math.floor(ctx.select_rand*ctx.attributes.with.length)];
            let target = ctx.attributes.target;

            if (typeof target === "string")
               return _changeToInput(html, target, replacement, false);
            else if (Array.isArray(target)){
                for (const e in target){
                    if (typeof e === "string")
                        html = _changeToInput(html, e, replacement, false);
                }
            }
            return html;
        }
    }

    /**
     * 特定のコマンドタイプで検索
     */
    findCommandsByType(commandType, commands = this.metaCommands) {
        const results = [];
        
        for (const cmd of commands) {
            if (cmd.command === commandType) {
                results.push(cmd);
            }
            
            if (cmd.children) {
                results.push(...this.findCommandsByType(commandType, cmd.children));
            }
        }
        
        return results;
    }

    /**
     * エラー情報を取得
     */
    getErrors() {
        return this.errors;
    }

    /**
     * パース統計を取得
     */
    getStatistics() {
        const stats = {
            totalCommands: 0,
            commandTypes: {},
            contexts: { html: 0, javascript: 0, css: 0 },
            errors: this.errors.length
        };

        const countCommands = (commands) => {
            for (const cmd of commands) {
                stats.totalCommands++;
                stats.commandTypes[cmd.command] = (stats.commandTypes[cmd.command] || 0) + 1;
                stats.contexts[cmd.context]++;
                
                if (cmd.children) {
                    countCommands(cmd.children);
                }
            }
        };

        countCommands(this.metaCommands);
        return stats;
    }
}