export class VoiceRecorder {
    constructor(onState, onComplete, onError) {
        this.onState=onState; this.onComplete=onComplete; this.onError=onError;
        this.state='idle'; this.token=0; this.stream=null; this.recorder=null;
    }
    get supported() { return typeof navigator!=='undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder!=='undefined'; }
    update(state) { this.state=state; this.onState(state); }
    release() {
        clearInterval(this.timer);
        this.stream?.getTracks().forEach(track=>track.stop());
        this.stream=null; this.recorder=null;
    }
    async start(nodeId) {
        if(this.state!=='idle') return;
        if(!this.supported){this.onError('Запись недоступна. Откройте приложение на localhost или через HTTPS в браузере с поддержкой микрофона.');return;}
        const token=++this.token;
        this.nodeId=nodeId; this.update('requesting');
        try {
            const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,sampleRate:{ideal:16000},echoCancellation:true,noiseSuppression:true},video:false});
            if(token!==this.token){stream.getTracks().forEach(track=>track.stop());return;}
            this.stream=stream;
            const mimeType=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
            const recorder=new MediaRecorder(stream,{audioBitsPerSecond:24000,...(mimeType?{mimeType}:{})});
            this.recorder=recorder;
            const chunks=[]; let bytes=0;
            recorder.ondataavailable=e=>{if(token!==this.token)return;if(e.data.size){chunks.push(e.data);bytes+=e.data.size;}if(bytes>=3*1024*1024)this.stop();};
            recorder.onerror=()=>{if(token!==this.token)return;this.cancel();this.onError('Ошибка записи микрофона. Попробуйте записать заново.');};
            recorder.onstop=async()=>{
                if(token!==this.token)return;
                this.update('finishing');this.release();
                try {
                    const blob=new Blob(chunks,{type:recorder.mimeType||mimeType||'audio/webm'});
                    if(!blob.size)throw Error('Получилась пустая запись. Попробуйте ещё раз.');
                    if(blob.size>5*1024*1024)throw Error('Запись превышает 5 МБ. Сделайте более короткую запись.');
                    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Не удалось прочитать запись'));reader.readAsDataURL(blob);});
                    if(token!==this.token)return;
                    const extension=blob.type.includes('ogg')?'ogg':blob.type.includes('mp4')?'m4a':'webm';
                    this.onComplete(nodeId,{kind:'audio',name:`Голос ${new Date().toLocaleString('ru-RU')}.${extension}`,data,size:blob.size,mimeType:blob.type});
                }catch(error){if(token===this.token)this.onError(error.message);}
                finally{if(token===this.token)this.update('idle');}
            };
            recorder.start(1000);this.started=Date.now();this.update('recording');
            this.timer=setInterval(()=>{if(Date.now()-this.started>=10*60*1000)this.stop();},1000);
        }catch(error){
            if(token!==this.token)return;
            this.release();this.update('idle');
            this.onError(error.name==='NotAllowedError'?'Доступ к микрофону запрещён. Разрешите его в настройках сайта и повторите запись.':error.name==='NotFoundError'?'Микрофон не найден. Подключите его и повторите запись.':'Не удалось включить микрофон: '+error.message);
        }
    }
    stop() { if(this.recorder?.state==='recording'){this.update('finishing');this.recorder.stop();} }
    cancel() { ++this.token; const recorder=this.recorder;this.release();if(recorder?.state==='recording')recorder.stop();this.update('idle'); }
}
