import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const careers = ['의류 상품 기획자(MD)','자산관리자','환경 지도자','패션 디자이너','섬유 소재 연구원','의류 수선 전문가','세탁·관리 전문가','윤리적 소비 컨설턴트','중고 의류 큐레이터','스타일리스트'];

function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
export function validate(payload){
  if (!payload || !careers.includes(payload.career) || !Array.isArray(payload.steps) || payload.steps.length !== 6) return false;
  return payload.steps.every(s=>Array.isArray(s?.answers)&&s.answers.length===3&&s.answers.every(a=>typeof a==='string'&&a.length<=1200));
}
export function createServer(){return http.createServer(async(req,res)=>{
  if(req.method==='POST'&&req.url==='/api/feedback'){
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>40000){send(res,413,{error:'입력 내용이 너무 깁니다.'});return;}}
    let data;try{data=JSON.parse(raw);}catch{send(res,400,{error:'요청 형식이 올바르지 않습니다.'});return;}
    if(!validate(data)){send(res,400,{error:'미션 답변과 직업을 확인해 주세요.'});return;}
    if(!process.env.OPENAI_API_KEY){send(res,503,{error:'AI 피드백 서버가 설정되지 않았습니다. 운영자가 OPENAI_API_KEY를 설정해야 합니다.'});return;}
    try{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
      let response;try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',store:false,max_output_tokens:650,instructions:`당신은 한국 중학생의 의복 마련 계획을 돕는 ${data.career}입니다. 구매를 강요하지 마세요. 학생의 실제 조사 답변을 근거로 장점 1개, 더 조사할 점 2개, 계획 수정 제안 2개를 따뜻하고 구체적인 한국어로 작성하세요. 가격·소재·인증 사실을 검증하지 못했다면 확인 필요하다고 명시하세요. 개인정보를 반복하지 마세요. 700자 이내의 일반 텍스트로 답하세요.`,input:JSON.stringify({직업:data.career,마련할옷:String(data.clothing||'').slice(0,40),미니활동:JSON.stringify(data.extra||{}).slice(0,2000),미션:data.steps.map((s,i)=>({단계:i+1,답변:s.answers}))})}),signal:controller.signal});}finally{clearTimeout(timer);}
      const body=await response.json();if(!response.ok)throw new Error('AI 서비스 응답 오류');
      const feedback=body.output_text||body.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
      if(!feedback)throw new Error('AI 피드백을 생성하지 못했습니다.');
      send(res,200,{feedback:feedback.slice(0,3000)});
    }catch(e){send(res,502,{error:e.name==='AbortError'?'응답 시간이 초과되었습니다. 다시 시도해 주세요.':'AI 피드백을 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요.'});}
    return;
  }
  if(req.method!=='GET'){send(res,405,{error:'허용되지 않는 요청입니다.'});return;}
  const pathname=new URL(req.url,'http://localhost').pathname;
  const files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js'};
  if(!files[pathname]){send(res,404,{error:'페이지를 찾을 수 없습니다.'});return;}
  try{const file=path.join(root,files[pathname]);const contents=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});res.end(contents);}catch{send(res,500,{error:'파일을 읽을 수 없습니다.'});}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))createServer().listen(port,()=>console.log(`http://localhost:${port}`));
