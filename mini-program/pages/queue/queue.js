import { getLiveQueue, actOnQueue } from '../../api/queue';
import { takeRouteParams } from '../../utils/storage';
const time=(v)=>{if(!v)return '—';const d=new Date(Date.parse(v)+8*3600000);return String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');};
Page({
 data:{snapshot:null,booking:null,notices:[],loading:true,error:'',message:'',busy:false,stale:true,lastSyncLabel:'尚未同步',lastSync:0,contactPhone:'',deadlineLabel:'',returnLabel:'',rules:''},
 bookingId:'',visible:false,flight:false,sequence:0,lastAlert:0,
 onLoad(options={}){const params=takeRouteParams();this.bookingId=options.bookingId||options.id||(params&&params.bookingId)||'';if(!this.bookingId)this.setData({loading:false,error:'缺少预约信息，请从个人中心的预约进入'});},
 onShow(){this.visible=true;this.setData({stale:true});this.startPolling();this.refresh(true);},
 onHide(){this.visible=false;this.sequence++;this.flight=false;this.stopPolling();},
 onUnload(){this.visible=false;this.sequence++;this.stopPolling();},
 startPolling(){this.stopPolling();this.timer=setInterval(()=>{this.updateFreshness();this.refresh();},5000);this.clock=setInterval(()=>this.updateFreshness(),1000);},
 stopPolling(){if(this.timer)clearInterval(this.timer);if(this.clock)clearInterval(this.clock);this.timer=null;this.clock=null;},
 updateFreshness(){this.setData({stale:!this.data.lastSync||Date.now()-this.data.lastSync>20000||!!this.data.error});},
 async refresh(force=false){
  if(!this.visible||!this.bookingId||(this.flight&&!force))return;
  const seq=++this.sequence;this.flight=true;
  try{
   const s=await getLiveQueue(this.bookingId);if(!this.visible||seq!==this.sequence)return;
   const b=s.booking;const now=Date.now();
   this.setData({snapshot:s,booking:b,notices:s.notices.map(n=>({...n,timeLabel:time(n.at)})),loading:false,error:'',stale:false,lastSync:now,lastSyncLabel:time(new Date(now).toISOString()),contactPhone:s.contactPhone,deadlineLabel:time(b.graceDeadlineAt),returnLabel:time(b.expectedReturnAt),rules:s.rules.text});
   const notice=s.notices.find(n=>['called','ready'].includes(n.type)&&!n.acknowledged);
   if(notice&&notice.id>this.lastAlert){this.lastAlert=notice.id;wx.vibrateLong({fail:()=>{}});wx.showToast({title:notice.type==='called'?'门店已叫号，请返回服务位':'请准备返回门店',icon:'none',duration:4000});}
  }catch(e){if(this.visible&&seq===this.sequence)this.setData({loading:false,error:e.message||'同步失败，请联系前台',stale:true});}
  finally{if(seq===this.sequence)this.flight=false;}
 },
 async act(e){
  const {action,minutes}=e.currentTarget.dataset;const b=this.data.booking;
  if(!b||this.data.stale||this.acting)return;this.acting=true;this.setData({busy:true,message:''});
  try{await actOnQueue(b.id,action,b.version,minutes==null?undefined:Number(minutes));this.setData({message:action==='return_requested'?'已提交返回信息，请到前台确认':action==='help_requested'?'协助请求已提交，请保持电话畅通':'操作已记录'});}
  catch(err){this.setData({message:err.message||'操作未确认，请刷新核对，不要反复提交'});}
  finally{await this.refresh(true);this.acting=false;this.setData({busy:false});}
 },
 onRefresh(){this.refresh(true);},
 callStore(){if(this.data.contactPhone)wx.makePhoneCall({phoneNumber:this.data.contactPhone});},
 goToShop(){wx.switchTab({url:'/pages/index/index'});},
});
