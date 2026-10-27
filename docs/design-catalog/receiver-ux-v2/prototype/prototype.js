// Design-only fixtures. No product module, screen picker, file input, or WASM.
const states = {
  idle: { label:'尚未开始', tag:'等待开始', title:'准备好接收文件', detail:'选择一种接收方式，开始从云桌面接收文件。', next:'让云桌面中的发送端开始播放码流，然后选择“实时抓屏”；已有录像也可以直接导入。' },
  preparing: { label:'准备接收', tag:'准备中', title:'正在准备接收', detail:'正在等待输入源与解码器就绪。', next:'选择包含完整发送画面的窗口。请保持码流区域清晰可见。', busy:true, source:'实时抓屏' },
  waiting: { label:'等待有效数据', tag:'等待数据', title:'等待有效数据', detail:'已开始观察画面，暂时还没有识别到可用码流。', next:'检查发送端是否正在播放，以及所选窗口是否包含完整码流。发送与接收都使用模式 B。', busy:true, source:'实时抓屏', elapsed:'00:08', rate:'0', note:'未取得可判定的重建进度。' },
  receiving: { label:'正常接收', tag:'接收中', title:'正在接收数据', detail:'已识别到码流，重建进度正在增加。', next:'保持发送画面可见并继续播放。文件完整后，接收器会提示你保存。', busy:true, source:'实时抓屏', elapsed:'01:24', rate:'12.4', progress:42.6 },
  repeated: { label:'重复数据，无新增进度', tag:'仍在识别', title:'暂时没有新进展', detail:'仍识别到码流，但最近 8 秒没有观察到进度增长。', next:'可能正在收到重复数据。保持发送端继续播放，检查是否停在同一画面。', busy:true, source:'实时抓屏', elapsed:'01:41', rate:'11.8', progress:42.6, note:'当前观察值保持不变，未虚增进度。', tone:'notice' },
  quiet: { label:'暂停收到有效数据', tag:'等待新数据', title:'最近没有识别到新数据', detail:'最近 5 秒没有收到可用数据，接收会话仍在等待。', next:'检查发送画面是否被遮挡、最小化或暂停。恢复后可继续观察进度。', busy:true, source:'实时抓屏', elapsed:'02:10', rate:'0', progress:42.6, note:'上次观测：42.6%。当前没有新的进度观测。', stale:true, tone:'notice' },
  unknown: { label:'多流进度不可判定', tag:'正在识别', title:'正在识别码流', detail:'识别到多个数据流，暂时无法确定当前文件的重建进度。', next:'请一次发送一个文件。如需切换发送内容，停止后重新开始接收。', busy:true, source:'实时抓屏', elapsed:'03:14', rate:'14.2', note:'进度暂不可判定；识别速率与接收用时仍可观察。', tone:'notice' },
  unavailable: { label:'进度接口不可用', tag:'接收中', title:'正在接收数据', detail:'已有数据到达，当前无法读取可靠的重建进度。', next:'可以继续接收。文件完整后，仍会按真实重建结果提示保存。', busy:true, source:'实时抓屏', elapsed:'00:28', rate:'10.1', note:'进度暂不可用，不影响原有接收流程。' },
  enough: { label:'理论数据量达到，尚未完成', tag:'继续收集', title:'继续补齐重建数据', detail:'已收集理论所需数据量，文件尚未完成重建。', next:'请继续播放发送画面。纠错重建可能仍需补充数据，完成后会明确提示。', busy:true, source:'实时抓屏', elapsed:'05:36', rate:'9.6', note:'不将数据量参考值当作文件完成，不显示虚构的剩余时间。' },
  video: { label:'录像导入中', tag:'接收中', title:'正在读取录像并接收数据', detail:'正在逐帧处理录像，已识别到有效码流。', next:'等待录像处理。下方录像位置表示读取到哪里，不代表文件已完整接收。', busy:true, source:'录像导入', elapsed:'01:36', rate:'16.7', progress:61.3, video:true },
  draining: { label:'处理最后的数据', tag:'收尾中', title:'正在处理最后的数据', detail:'输入已经结束，正在等待最后的解码结果。', next:'请稍候。只有实际重建出完整文件，才会启用保存。', busy:true, source:'录像导入', elapsed:'02:31', rate:null, note:'正在完成原有 EOF 排空流程，尚未确认文件完整。', video:true },
  ready: { label:'文件可保存', tag:'接收完成', title:'文件已接收完成，请保存', detail:'文件已完整重建。选择保存位置，将它存到宿主机。', next:'点击“保存文件…”。取消保存后，文件仍保留在当前页面，可以再次保存。', source:'实时抓屏', elapsed:'02:18', artifact:true, canSave:true, complete:true },
  saving: { label:'正在选择保存位置', tag:'保存中', title:'请选择保存位置', detail:'文件已接收完成，正在等待保存操作结算。', next:'在系统保存窗口中选择路径。此原型使用下方按钮演示三种结果。', source:'实时抓屏', elapsed:'02:18', artifact:true, complete:true, saving:true, busy:true },
  cancelled: { label:'保存已取消', tag:'仍可保存', title:'已取消保存，文件仍在', detail:'文件已经接收完成，你可以重新选择保存位置。', next:'点击“保存文件…”再次保存，无需重新接收。', source:'实时抓屏', elapsed:'02:18', artifact:true, complete:true, canSave:true, tone:'notice' },
  failed: { label:'保存失败，可重试', tag:'仍可保存', title:'保存失败，可以重试', detail:'文件仍在当前页面。请检查保存位置或权限后再试。', next:'点击“保存文件…”重新选择可写的位置，无需重新接收。', source:'实时抓屏', elapsed:'02:18', artifact:true, complete:true, canSave:true, tone:'error' },
  saved: { label:'文件已保存', tag:'已保存', title:'文件已保存到宿主机', detail:'写入与关闭均已成功。你可以开始下一次接收。', next:'接收另一个文件时，选择“实时抓屏”或“录像导入”。新会话会从零开始。', source:'实时抓屏', elapsed:'02:18', artifact:true, complete:true, saved:true },
  incomplete: { label:'录像耗尽，文件未完整', tag:'未完成', title:'数据不足，文件未完成', detail:'录像已处理结束，未能重建出完整文件。', next:'尝试导入更完整的录像，或重新抓屏接收。没有完整文件可供保存。', source:'录像导入', elapsed:'02:31', video:true, tone:'notice' },
  stopped: { label:'已停止', tag:'已停止', title:'接收已停止', detail:'本次输入已释放，可以重新选择接收方式。', next:'重新接收会从零开始，上一会话的数据与进度不会带入新会话。', elapsed:'00:42' },
};
const $ = (id) => document.getElementById(id);
let current = 'idle';
let timers = [];
function cancelDemoTimers(){timers.forEach(clearTimeout);timers=[];}
for (const [key, state] of Object.entries(states)) {
  const option=document.createElement('option');option.value=key;option.textContent=state.label;$('scenario').append(option);
}
function show(key) {
  const s=states[key];if(!s)return;current=key;$('scenario').value=key;
  $('state-tag').textContent=s.tag;$('state-tag').dataset.tone=s.tone||'normal';
  $('status-title').textContent=s.title;$('status-detail').textContent=s.detail;
  $('next-action').textContent=s.next;$('source').textContent=s.source||'尚未选择输入';
  $('rate').textContent=s.rate==null?'—':s.rate;$('rate-unit').textContent=s.rate!=null?'KiB/s':'';
  $('elapsed').textContent=s.elapsed||'00:00';$('elapsed-note').textContent=s.artifact||key==='incomplete'||key==='stopped'?'接收用时已冻结':s.busy?'从开始接收起计时':'开始接收后计时';
  const progress=$('rebuild-progress');
  if(s.complete){progress.value=100;$('progress-text').textContent='接收完成';}
  else if(typeof s.progress==='number'){progress.value=s.progress;$('progress-text').textContent=(s.stale?'上次 ':'')+s.progress+'%';}
  else if(key==='idle'||key==='stopped'){progress.value=0;$('progress-text').textContent=key==='idle'?'尚未开始':'已结束';}
  else{progress.removeAttribute('value');$('progress-text').textContent=key==='enough'?'继续补齐':key==='unknown'?'暂不可判定':key==='unavailable'?'暂不可用':'等待观测';}
  progress.setAttribute('aria-valuetext',$('progress-text').textContent);
  $('progress-note').textContent=s.note||(s.complete?'接收完成来自真实重建结果；保存成功会另行确认。':'根据不同数据块的收集比例估计，完整重建后才可保存。');
  $('video-position').hidden=!s.video;$('media-text').textContent=key==='incomplete'||key==='draining'?'02:30 / 02:30':'01:20 / 02:30';$('media-progress').value=key==='incomplete'||key==='draining'?150:80;
  $('artifact').hidden=!s.artifact;$('file-status').textContent=s.saved?'已保存':s.saving?'等待保存结算':'等待保存';$('save-demo').hidden=!s.saving;
  const canStart=['idle','saved','incomplete','stopped'].includes(key);
  $('btn-live').disabled=!canStart;$('btn-video').disabled=!canStart;
  $('btn-stop').disabled=canStart;$('btn-save').disabled=!s.canSave;
  $('diagnostic-text').textContent='仅供设计评审的演示快照\n'+JSON.stringify({scenario:key,input:s.source||null,progressEstimate:s.progress??null,rateKiB:s.rate??null,artifact:!!s.artifact,save:s.saved?'saved':s.saving?'selecting':s.canSave?'available':'none'},null,2);
}
$('scenario').addEventListener('change',(e)=>{cancelDemoTimers();show(e.target.value);});
$('btn-live').addEventListener('click',()=>{
  cancelDemoTimers();show('preparing');
  timers.push(setTimeout(()=>show('waiting'),800));
  timers.push(setTimeout(()=>show('receiving'),2000));
  timers.push(setTimeout(()=>show('ready'),5500));
});
$('btn-video').addEventListener('click',()=>{cancelDemoTimers();show('video');timers.push(setTimeout(()=>show('ready'),4000));});
$('btn-stop').addEventListener('click',()=>{cancelDemoTimers();show('stopped');});
$('btn-save').addEventListener('click',()=>{cancelDemoTimers();show('saving');$('save-ok').focus();});
$('save-ok').addEventListener('click',()=>{show('saved');$('btn-live').focus();});
$('save-cancel').addEventListener('click',()=>{show('cancelled');$('btn-save').focus();});
$('save-fail').addEventListener('click',()=>{show('failed');$('btn-save').focus();});
show('idle');
