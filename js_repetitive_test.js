let editor;
let output;
let input;
let score_log;
let pyodideReadyPromise;
let fileName="untitled.py";

let g_module;
let start_time=0;
let end_time=0;
let previous_code = "";

let currentCode="";
let score = 0;
let executed=true;

let template = `
`;

let each_score = {};
let detail_log = []

let explanations = "";
let random_seed = 0;

// let quizMode = 'prediction';
let quizMode = 'fill_in';

function init(){

    // JSONファイルを取得して表示
    fetch("exercises.json")
        .then( response => response.json())
        .then( data => {
            const exercises = document.querySelector("#exercises");

            data.forEach(item => {

                const optgroup = document.createElement('optgroup');
                optgroup.label=item.chapter;
                for(const key in item.exercises){
                    const option = document.createElement('option');
                    option.value=item.exercises[key];
                    option.textContent=key;

                    optgroup.appendChild(option);    
                }
                exercises.appendChild(optgroup);
            });
        });

    quizModeChange();

    document.querySelector("#nextQuestion").addEventListener('click', parseMetaComments);
    document.querySelector("#getScoreLog").addEventListener('click', getScoreLog);
}

function setMaterial(){

    const sel = document.querySelector('#exercises');
    if (!sel.value){
        alert("ファイルがありません.");
        return;
    }

    const ques_index = sel.selectedIndex;
	currentCode = sel.options[ques_index].textContent;

    // currentCode = sel.textContent;
    fileName=sel.value;
    fetch("./exercises/"+fileName, {
        cache: "no-store",
        method: "GET",
    })
    .then(response => response.text())
    .then(text => {
        template = text;
    
        total_time=0;
        score=0;

        if (template.includes('<!-- meta[predictProgramExecution] /-->')){
            quizMode='prediction';
        }
        else{
            quizMode='fill_in';
        }

        quizModeChange();

        executed = true;
        parseMetaComments();

        start_time = performance.now();
    });
}

function checkAnswer_for_fill_in(){
    if (executed)
        return;

    executed = true;
    const container = document.getElementById('html-source');
    const inputs = container.querySelectorAll('input[type="text"]');
    let result="正解";
    inputs.forEach(input => {
        const answer = input.dataset.answer.replaceAll("'","\"");
        //ダブルクォートとシングルクォートを統一した上で比較
        if (input.value.replaceAll("'","\"") === answer){
            input.classList.add('glow-green-natural');
        }
        else{
            input.classList.add('glow-red-natural');
            input.value = answer;
            result="不正解";
        }        
    });
    
    if (result==="正解"){
        score+=10;
    }
    else{
        score-=10;
    }

    calc_score(result);
}

function parseMetaComments() {

    if (!template.trim()) {
        alert('出題分野を選択してしてください．');
        return;
    }

    if (!executed)
        return;

    const preHtmlPreview = document.getElementById('html-preview').innerHTML;
    // const structure = parser.printStructure();
    // structure.forEach(line => console.log(line));

    let originalHtml="";
    let quizInputHtml="";
    let i=0;

    random_seed = parseInt(document.querySelector("#random_seed").value);
    console.log('document.querySelector("#random_seed")=',random_seed);
    if (!isNaN(random_seed)){
        const parser = new HTMLMetaParser();//乱数のキャッシュをクリアするため再構築
        const parseResult = parser.parse(template);
        console.log(parseResult);

        [originalHtml, quizInputHtml] = parser.printQuiz(random_seed);
    }
    else{
        do{
            const parser = new HTMLMetaParser();//乱数のキャッシュをクリアするため再構築
            const parseResult = parser.parse(template);
            if (i===0)
                console.log(parseResult);

            random_seed = new Date().getTime()+i;
            console.log("random_seed=",random_seed);

            [originalHtml, quizInputHtml] = parser.printQuiz(random_seed);

            if (quizMode==='fill_in'){
                let input_indexOf = quizInputHtml.indexOf('<input type="text"');
                if (originalHtml !== preHtmlPreview && input_indexOf>=0)
                    break;
            }
            else if(quizMode==='prediction'){
                if (originalHtml !== preHtmlPreview)
                    break;
            }

            i++;
        }while(i<100);
        console.log("穴埋めが含まれ，かつ直前の問題と一致しないように反復した生成回数",i);
    }


    document.getElementById('html-source').innerHTML = quizInputHtml;

    const iframe = document.getElementById('html-preview');
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(originalHtml);
    doc.close();

    if (quizMode==='prediction'){
        iframe.style.visibility='hidden';
        document.getElementById('html-input').value = "";
    }
    else{
        iframe.style.visibility='visible';
    }

    executed = false;
}

function getScoreLog() {
    // テキストエリアの内容を取得
    const text = document.getElementById("score_log").innerHTML;
    
    // テキストが空の場合の確認
    if (text.trim() === '') {
        return;
    }
    
    // ファイル名を取得（空の場合はデフォルト名を使用）
    let fileName = 'score_log.txt';
        
    // Blobオブジェクトとしてテキストデータを作成
    // UTF-8エンコーディングで日本語も正しく保存
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    
    // ダウンロード用のURLを作成
    const url = URL.createObjectURL(blob);
    
    // 一時的なaタグを作成してダウンロードを実行
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    
    // 一時的な要素とURLをクリーンアップ
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // ダウンロード完了の通知
    // alert(`ファイル "${fileName}" がダウンロードされました！`);
}

function quizModeChange(){
    if (quizMode==='fill_in'){
        document.querySelector("#checkAnswer").removeEventListener('click', checkAnswer_for_prediction);
        document.querySelector("#checkAnswer").addEventListener('click', checkAnswer_for_fill_in);
    }
    else {
        document.querySelector("#checkAnswer").removeEventListener('click', checkAnswer_for_fill_in);
        document.querySelector("#checkAnswer").addEventListener('click', checkAnswer_for_prediction);
    } 

    const containerHtml = (quizMode==='prediction')?
            `<h4 style="margin-bottom:10px;">問題: ソースコードを参考に、予想される表示結果を入力してください</h4>
            <div style="display: flex; gap: 10px;height:95%">
                <div style="flex: 2;padding: 10px 10px; border: 2px solid #ccc;background:white;border-radius: 10px;">
                    <h4>ソースコード:</h4>
                    <div id="html-source" style="white-space: pre-wrap;;max-height:400px;overflow-y:auto;"></div>
                </div>
                <div style="flex: 1;padding: 10px 10px; border: 2px solid #ccc;background:white;border-radius: 10px;">
                    <h4>予想される表示結果:</h4>
                    <div style="height:100%;">
                        <textarea id="html-input" style="border:1;height:95%;overflow-y:auto;"></textarea>            
                    </div>
                </div>
                <div style="flex: 1;padding: 10px 10px; border: 2px solid #ccc;background:white;border-radius: 10px;">
                    <h4>実際の表示結果:</h4>
                    <div style="height:100%;">
                        <iframe id="html-preview" style="border:0;margin:0;height:80%;overflow-y:auto;"></iframe>            
                    </div>
                </div>
            </div>`:
            `<h4 style="margin-bottom:10px;">問題: 表示結果を参考に、ソースコードの空欄を埋めてください</h4>
            <div style="display: flex; gap: 10px;height:95%">
                <div style="flex: 1;padding: 10px 10px; border: 2px solid #ccc;background:white;border-radius: 10px;">
                    <h4>表示結果:</h4>
                    <div style="height:100%;">
                        <iframe id="html-preview" style="border:0;height:80%;overflow-y:auto;"></iframe>            
                    </div>
                </div>
                <div style="flex: 2;padding: 10px 10px; border: 2px solid #ccc;background:white;border-radius: 10px;">
                    <h4>ソースコード:</h4>
                    <div id="html-source" style="white-space: pre-wrap;;max-height:400px;overflow-y:auto;"></div>
                </div>
            </div>`;

    document.getElementById("container").innerHTML = containerHtml;

}

function checkAnswer_for_prediction(){
    if (executed)
        return;

    executed = true;
    const input = document.getElementById('html-input');
    const iframe = document.getElementById('html-preview');
    iframe.style.visibility="visible";
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;    
    const bodyHTML = iframeDoc.body.innerHTML;
    const answer = bodyHTML.replaceAll("<br>","\n").trim();
    const result = (input.value.trim() === answer)? "正解":"不正解";

    if (result==="正解"){
        score+=10;
    }
    else{
        score-=10;
    }

    const result_str = (result==="正解")? "\n\n正解！！" : "\n\n不正解...";
    document.getElementById('html-input').value+=result_str;

    calc_score(result);
}

function calc_score(result){
    each_score[currentCode]=score;
    detail_log.push(currentCode+" "+random_seed+" "+result);

    let target_score = document.querySelector("#target_score").value;
    target_score = parseInt(target_score);
    if (score===target_score){
        let obj = document.querySelector("#achieved");
        obj.innerHTML=""+target_score+"点";
        obj.style.visibility = 'visible';
        setTimeout(function(){
            document.querySelector("#achieved").style.visibility = 'hidden';
        }, 800);
    }

    let str="--- 各問題のスコア ---\n";
    const sortedKeys = Object.keys(each_score).sort();
    sortedKeys.forEach(key => {
        str+=`${key}: ${each_score[key]}点\n`;
    });
    str+="\n-- 詳細 --\n";

    for (const e of detail_log) {
        str+=e+"\n";
    }
    document.getElementById("score_log").innerHTML = str;
}