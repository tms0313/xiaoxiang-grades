
// ==================================================
// 段考成績登錄（獨立資料表，不影響週成績）
// ==================================================

async function renderTermExamEntry() {
  const content=$("adminContent"), subjects=["國文","英文","數學","歷史","地理","公民","自然"];
  const keys=["subject_chinese","subject_english","subject_math","subject_history","subject_geography","subject_civics","subject_natural"];
  const classes=["國一班","國二班","國三班"], draftKey="xiaoxiang-term-exam-entry-draft-v2", prefKey="xiaoxiang-term-exam-entry-selection-v2";
  let records=[];
  let recordsById=new Map();
  let recordsByStudentKey=new Map();
  let overviewStaticCache=null;
  const termStudentsByClass = new Map();
  studentsCache.forEach(function(student) {
    if (student.is_active === false) return;
    if (!termStudentsByClass.has(student.class_name)) {
      termStudentsByClass.set(student.class_name, []);
    }
    termStudentsByClass.get(student.class_name).push(student);
  });
  termStudentsByClass.forEach(function(students) {
    students.sort((a, b) =>
      String(a.student_code || "").localeCompare(
        String(b.student_code || ""),
        "zh-Hant",
        { numeric: true }
      )
    );
  });
  const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||"null")||d;}catch(_){return d;}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(_){}};
  const available=y=>String(y).trim()==="114"?["國一班","國二班"]:classes;
  const rosterClass=(y,c)=>String(y).trim()==="114"?({"國一班":"國二班","國二班":"國三班"})[c]||"":c;
  const criteria=()=>({year:$("termAcademicYear").value.trim(),semester:$("termSemester").value,exam:$("termExamNumber").value,className:$("termClass").value});
  const termRecordKey=(year,semester,exam,studentId)=>JSON.stringify([String(year),String(semester),String(exam),String(studentId)]);
  const ready=c=>!!(c.year&&c.semester&&c.exam&&c.className), cid=c=>[c.year,c.semester,c.exam,c.className].join("|");
  const drafts=()=>read(draftKey,{});
  function saveDraft(row){
    const c=criteria();if(!ready(c))return;
    const all=drafts(),id=cid(c);all[id]=all[id]||{};const d={};
    keys.forEach((k,i)=>d[k]=row.querySelector('[data-term-score="'+i+'"]').value);
    d.class_rank=row.querySelector("[data-term-class-rank]").value;d.school_rank=row.querySelector("[data-term-school-rank]").value;
    all[id][row.dataset.termStudent]=d;write(draftKey,all);
    const active=document.activeElement;
    write(prefKey,{...c,studentId:row.dataset.termStudent,field:active?.dataset?.termScore??(active?.hasAttribute("data-term-class-rank")?"class_rank":active?.hasAttribute("data-term-school-rank")?"school_rank":"")});
    const status=$("termDraftStatus");if(status)status.textContent="輸入進度已自動暫存於此裝置";
  }
  function updateCompletionMark(row){
    const complete=keys.every((_,i)=>row.querySelector('[data-term-score="'+i+'"]').value.trim()!=="");
    const mark=row.querySelector(".term-completion-mark");
    if(!mark)return;
    mark.classList.toggle("is-complete",complete);
    mark.classList.toggle("is-incomplete",!complete);
    mark.textContent=complete?"✓":"●";
    mark.setAttribute("aria-label",complete?"七科成績完整":"尚有科目未輸入");
    mark.title=complete?"七科成績完整":"尚有科目未輸入";
  }
  function total(row){
    const v=keys.map((_,i)=>row.querySelector('[data-term-score="'+i+'"]').value.trim());
    const n=v.every(x=>x!=="")?v.reduce((a,x)=>a+Number(x),0):null;
    row.querySelector("[data-term-total]").textContent=n===null?"—":n.toFixed(2).replace(/\.00$/,"").replace(/(\.\d)0$/,"$1");
  }
  function renderRoster(){
    const c=criteria(),root=$("termExamRoster");
    if(!ready(c)){root.innerHTML="<div class='empty'>請先選擇學年度、學期、段考及班級，系統就會帶入整班學生。</div>";return;}
    const students=termStudentsByClass.get(rosterClass(c.year,c.className)) || [];
    if(!students.length){root.innerHTML="<div class='empty'>目前班級沒有在學學生。</div>";return;}
    const classDraft=(drafts()[cid(c)]||{});
    const rows=students.map(st=>{
      const old=recordsByStudentKey.get(termRecordKey(c.year,c.semester,c.exam,st.id));
      const d=classDraft[String(st.id)]||{},v=k=>d[k]!==undefined?d[k]:(old&&old[k]!=null?old[k]:"");
      const cells=keys.map((k,i)=>"<td><input data-term-score='"+i+"' type='number' min='0' max='100' step='0.01' inputmode='decimal' aria-label='"+subjects[i]+"成績' value='"+escapeHtml(v(k))+"'></td>").join("");
      const sum=keys.every(k=>v(k)!=="")?keys.reduce((n,k)=>n+Number(v(k)),0).toFixed(2).replace(/\.00$/,"").replace(/(\.\d)0$/,"$1"):"—";
      return "<tr data-term-student='"+escapeHtml(st.id)+"'><td class='term-student-name'><span class='term-student-name-text'>"+escapeHtml(st.full_name)+"</span><small>"+escapeHtml(st.student_code||"")+"</small>"+"<span class='term-completion-mark "+(keys.every(k=>v(k)!=="")?"is-complete' role='img' aria-label='七科成績完整' title='七科成績完整'>✓":"is-incomplete' role='img' aria-label='尚有科目未輸入' title='尚有科目未輸入'>●")+"</span>"+"</td>"+cells+
        "<td class='term-total-cell' data-term-total>"+sum+"</td><td><input data-term-class-rank type='number' min='1' step='1' value='"+escapeHtml(v("class_rank"))+"' aria-label='班排'></td>"+
        "<td><input data-term-school-rank type='number' min='1' step='1' value='"+escapeHtml(v("school_rank"))+"' aria-label='校排'></td></tr>";
    }).join("");
    root.innerHTML="<div class='term-roster-toolbar'><span>共 "+students.length+" 位學生；填寫完成後可一次儲存整班。</span><span id='termDraftStatus' class='term-draft-status'>"+(Object.keys(classDraft).length?"已還原上次未完成的輸入":"輸入時會自動暫存")+"</span></div>"+
      "<div class='table-wrap term-roster-wrap'><table class='term-bulk-table'><thead><tr><th>學生</th>"+subjects.map(x=>"<th>"+x+"</th>").join("")+"<th>總分</th><th>班排</th><th>校排</th></tr></thead><tbody>"+rows+"</tbody></table></div>"+
      "<div class='toolbar term-bulk-actions'><button class='btn btn-success' id='termSaveClassButton' type='button'>儲存整班成績</button><button class='btn btn-secondary' id='termClearDraftButton' type='button'>清除未儲存暫存</button></div>";
    root.querySelectorAll("tbody tr").forEach(row=>{
      row.querySelectorAll("input").forEach(input=>{
        if(input.matches("[data-term-score]")) updateScoreInputWarning(input, true);
        input.addEventListener("input",()=>{
          if(input.matches("[data-term-score]")) updateScoreInputWarning(input, true);
          total(row);updateCompletionMark(row);saveDraft(row);
        });
      });
      updateCompletionMark(row);
    });
    $("termSaveClassButton").addEventListener("click",saveClass);
    $("termClearDraftButton").addEventListener("click",()=>{if(!confirm("確定清除目前班級尚未儲存的暫存資料？已存入資料庫的成績不會受到影響。"))return;const all=drafts();delete all[cid(c)];write(draftKey,all);renderRoster();});
    const p=read(prefKey,{});if(p&&cid(p)===cid(c)&&p.studentId){
      const row=Array.from(root.querySelectorAll("tr[data-term-student]")).find(x=>x.dataset.termStudent===String(p.studentId));
      if(row){const sel=p.field==="class_rank"?"[data-term-class-rank]":p.field==="school_rank"?"[data-term-school-rank]":p.field!==""?'[data-term-score="'+p.field+'"]':null;const target=sel?row.querySelector(sel):null;if(target)target.focus({preventScroll:true});}
    }
  }
  async function saveClass(){
    const c=criteria();if(!ready(c)){alert("請先完整選擇學年度、學期、段考及班級。");return;}
    const button=$("termSaveClassButton"),rows=Array.from($("termExamRoster").querySelectorAll("tbody tr[data-term-student]")),payloads=[];
    let oldCount = 0;
    for(const row of rows){
      const vals=keys.map((_,i)=>row.querySelector('[data-term-score="'+i+'"]').value.trim()),cr=row.querySelector("[data-term-class-rank]").value.trim(),sr=row.querySelector("[data-term-school-rank]").value.trim();
      const has=vals.some(x=>x!==""),ranked=cr!==""||sr!=="";
      if(!has&&!ranked)continue;
      if(has&&vals.some(x=>x==="")){alert(row.querySelector(".term-student-name").childNodes[0].textContent.trim()+"：七科成績請全部填寫，或整列留白。");row.querySelector('[data-term-score="'+vals.indexOf("")+'"]').focus();return;}
      for(let i=0;i<vals.length;i++)if(vals[i]!==""&&(!Number.isFinite(Number(vals[i]))||Number(vals[i])<0||Number(vals[i])>100)){alert(subjects[i]+"成績必須介於 0～100 分。");row.querySelector('[data-term-score="'+i+'"]').focus();return;}
      for(const [x,label] of [[cr,"班排"],[sr,"校排"]])if(x!==""&&(!Number.isInteger(Number(x))||Number(x)<1)){alert(label+"請輸入大於 0 的整數，或保持空白。");return;}
      const studentId=row.dataset.termStudent,old=recordsByStudentKey.get(termRecordKey(c.year,c.semester,c.exam,studentId));
      if(old)oldCount++;
      payloads.push({academic_year:c.year,semester:c.semester,exam_number:Number(c.exam),class_name:c.className,student_id:studentId,
        subject_chinese:vals[0]===""?null:Number(vals[0]),subject_english:vals[1]===""?null:Number(vals[1]),subject_math:vals[2]===""?null:Number(vals[2]),
        subject_history:vals[3]===""?null:Number(vals[3]),subject_geography:vals[4]===""?null:Number(vals[4]),subject_civics:vals[5]===""?null:Number(vals[5]),
        subject_natural:vals[6]===""?null:Number(vals[6]),total_score:has?vals.reduce((a,x)=>a+Number(x),0):(old?old.total_score:null),
        class_rank:cr===""?null:Number(cr),school_rank:sr===""?null:Number(sr),updated_at:new Date().toISOString()});
    }
    if(!payloads.length){alert("目前沒有可儲存的成績或排名。");return;}
    if(oldCount&&!confirm("本次將儲存 "+payloads.length+" 位學生，其中 "+oldCount+" 位已有段考資料，是否確認更新？"))return;
    button.disabled=true;button.textContent="整班儲存中……";
    try{
      const result=await db.from("term_exam_scores").upsert(payloads,{onConflict:"academic_year,semester,exam_number,student_id"});if(result.error)throw result.error;
      const all=drafts();delete all[cid(c)];write(draftKey,all);await loadRecords();renderRoster();
      showMessage("整班段考成績已儲存，共 "+payloads.length+" 位學生。","success",true);
    }catch(error){alert("整班儲存失敗："+error.message+"。輸入暫存仍保留，可修正後再試。");}
    finally{const b=$("termSaveClassButton");if(b){b.disabled=false;b.textContent="儲存整班成績";}}
  }
  function updateClasses(){const sel=$("termClass"),old=sel.value,list=available($("termAcademicYear").value);sel.innerHTML="<option value=''>請選擇班級</option>"+list.map(x=>"<option value='"+x+"'>"+x+"</option>").join("");sel.value=list.includes(old)?old:"";}
  function renderRecords(){
    const root=$("termExamRecords"),p={year:root.querySelector("#termFilterYear")?.value||"",semester:root.querySelector("#termFilterSemester")?.value||"",exam:root.querySelector("#termFilterExam")?.value||"",className:root.querySelector("#termFilterClass")?.value||"",subject:root.querySelector("#termFilterSubject")?.value||"total_score",name:root.querySelector("#termFilterStudentName")?.value||""};
    if(!overviewStaticCache){
      overviewStaticCache={
        years:[...new Set(records.map(x=>String(x.academic_year||"")))].filter(Boolean).sort((a,b)=>b.localeCompare(a,"zh-Hant",{numeric:true})),
        options:subjects.map((name,i)=>({key:keys[i],name})).concat([{key:"total_score",name:"總分"},{key:"class_rank",name:"班排名"},{key:"school_rank",name:"校排名"}]),
        studentsById:studentsByIdCache
      };
    }
    const years=overviewStaticCache.years,options=overviewStaticCache.options,studentsById=overviewStaticCache.studentsById;
    const chosen=options.find(x=>x.key===p.subject)||options[0],q=p.name.trim().toLocaleLowerCase();
    const filtered=records.filter(r=>{const student=studentsById.get(String(r.student_id));const studentName=String(student?.full_name||"");return(!p.year||String(r.academic_year)===p.year)&&(!p.semester||r.semester===p.semester)&&(!p.exam||String(r.exam_number)===p.exam)&&(!p.className||r.class_name===p.className)&&(!q||studentName.toLocaleLowerCase().includes(q));});
    const sorted=filtered.slice().sort((a,b)=>{const av=a[chosen.key],bv=b[chosen.key];const an=av==null||av===""?null:Number(av),bn=bv==null||bv===""?null:Number(bv);if(an===null&&bn!==null)return 1;if(bn===null&&an!==null)return -1;if(an!==null&&bn!==null&&an!==bn)return bn-an;return String(studentsById.get(String(a.student_id))?.full_name||"").localeCompare(String(studentsById.get(String(b.student_id))?.full_name||""),"zh-Hant");});
    const rows=sorted.map(r=>{const st=studentsById.get(String(r.student_id)),v=r[chosen.key],score=chosen.key!=="class_rank"&&chosen.key!=="school_rank";return "<tr><td>"+escapeHtml(r.academic_year+" ("+(r.semester==="上學期"?"上":"下")+") "+(["","第一次","第二次","第三次"][Number(r.exam_number)]||""))+"</td><td>"+escapeHtml(r.class_name)+"</td><td>"+escapeHtml(st?.full_name||"學生資料不存在")+"</td><td>"+(v==null?"—":score&&Number(v)<60?"<span class='low-score'>"+escapeHtml(v)+"</span>":escapeHtml(v))+"</td><td class='action-cell'><div class='action-buttons'><button class='btn btn-small' data-term-edit='"+escapeHtml(r.id)+"'>修改</button><button class='btn btn-danger btn-small' data-term-delete='"+escapeHtml(r.id)+"'>刪除</button></div></td></tr>";}).join("");
    root.innerHTML="<div class='form-grid term-exam-overview-filters' style='row-gap:8px;column-gap:12px;margin-bottom:14px'><div class='field'><label>學年度</label><select id='termFilterYear'><option value=''>全部學年度</option>"+years.map(y=>"<option>"+escapeHtml(y)+"</option>").join("")+"</select></div><div class='field'><label>上下學期</label><select id='termFilterSemester'><option value=''>全部學期</option><option>上學期</option><option>下學期</option></select></div><div class='field'><label>段考</label><select id='termFilterExam'><option value=''>全部段考</option><option value='1'>第一次</option><option value='2'>第二次</option><option value='3'>第三次</option></select></div><div class='field'><label>班級</label><select id='termFilterClass'><option value=''>全部班級</option>"+classes.map(x=>"<option>"+x+"</option>").join("")+"</select></div><div class='field'><label>科目</label><select id='termFilterSubject'>"+options.map(x=>"<option value='"+x.key+"'>"+x.name+"</option>").join("")+"</select></div><div class='field'><label>學生姓名</label><input id='termFilterStudentName' placeholder='輸入學生姓名搜尋'></div></div>"+
      (filtered.length?"<div class='table-wrap'><table class='term-exam-overview-table'><thead><tr><th>考試</th><th>班級</th><th>學生</th><th>"+chosen.name+"</th><th>操作</th></tr></thead><tbody>"+rows+"</tbody></table></div>":"<div class='empty'>"+(records.length?"目前篩選條件沒有符合的段考成績。":"目前尚無段考成績。")+"</div>");
    for(const id of ["termFilterYear","termFilterSemester","termFilterExam","termFilterClass","termFilterSubject","termFilterStudentName"]){const el=root.querySelector("#"+id);const map={"termFilterYear":"year","termFilterSemester":"semester","termFilterExam":"exam","termFilterClass":"className","termFilterSubject":"subject","termFilterStudentName":"name"};el.value=p[map[id]]||"";if(id==="termFilterSubject")el.value=chosen.key;el.addEventListener("change",renderRecords);}
  }
  async function loadRecords(){const res=await db.from("term_exam_scores").select("id, academic_year, semester, exam_number, class_name, student_id, subject_chinese, subject_english, subject_math, subject_history, subject_geography, subject_civics, subject_natural, total_score, class_rank, school_rank").order("academic_year",{ascending:false}).order("semester").order("exam_number").order("class_name").order("student_id");if(res.error)throw res.error;records=res.data||[];recordsById=new Map(records.map(record=>[String(record.id),record]));recordsByStudentKey=new Map();records.forEach(record=>recordsByStudentKey.set(termRecordKey(record.academic_year,record.semester,record.exam_number,record.student_id),record));overviewStaticCache=null;renderRecords();}
  const saved=read(prefKey,{});
  content.innerHTML="<h2 class='section-title'>段考成績登錄</h2><div class='panel term-exam-form'><div class='form-grid'>"+
    "<div class='field'><label for='termAcademicYear'>學年度（手動輸入）</label><input id='termAcademicYear' maxlength='20' placeholder='例如：115' value='"+escapeHtml(saved.year||"")+"'></div>"+
    "<div class='field'><label for='termSemester'>學期</label><select id='termSemester'><option value=''>請選擇學期</option><option value='上學期'>上學期</option><option value='下學期'>下學期</option></select></div>"+
    "<div class='field'><label for='termExamNumber'>段考</label><select id='termExamNumber'><option value=''>請選擇段考</option><option value='1'>第一次段考</option><option value='2'>第二次段考</option><option value='3'>第三次段考</option></select></div>"+
    "<div class='field'><label for='termClass'>班級</label><select id='termClass'><option value=''>請選擇班級</option>"+available(saved.year||"").map(x=>"<option value='"+x+"'>"+x+"</option>").join("")+"</select></div></div></div>"+
    "<div id='termExamRoster'><div class='empty'>請先選擇學年度、學期、段考及班級。</div></div><div class='panel'><h3 id='termExamOverviewTitle'>段考成績總覽</h3><div id='termExamRecords'>資料載入中……</div></div>";
  $("termSemester").value=saved.semester||"";$("termExamNumber").value=saved.exam||"";$("termClass").value=available(saved.year||"").includes(saved.className)?saved.className:"";
  for(const id of ["termAcademicYear","termSemester","termExamNumber","termClass"]){$(id).addEventListener(id==="termAcademicYear"?"input":"change",()=>{if(id==="termAcademicYear")updateClasses();write(prefKey,criteria());renderRoster();});}
  try{
    await loadRecords();renderRoster();
    $("termExamRecords").addEventListener("click", async e => {
      const edit = e.target.closest("[data-term-edit]");
      if (edit) {
        const rec = recordsById.get(edit.dataset.termEdit);
        if (!rec) return;
        $("termAcademicYear").value = rec.academic_year || "";
        updateClasses();
        $("termSemester").value = rec.semester || "";
        $("termExamNumber").value = String(rec.exam_number || "");
        $("termClass").value = rec.class_name || "";
        write(prefKey, criteria());
        renderRoster();
        const row = Array.from($("termExamRoster").querySelectorAll("tr[data-term-student]"))
          .find(x => x.dataset.termStudent === String(rec.student_id));
        if (row) {
          keys.forEach((key, index) => {
            row.querySelector('[data-term-score="' + index + '"]').value =
              rec[key] == null ? "" : rec[key];
          });
          row.querySelector("[data-term-class-rank]").value =
            rec.class_rank == null ? "" : rec.class_rank;
          row.querySelector("[data-term-school-rank]").value =
            rec.school_rank == null ? "" : rec.school_rank;
          total(row);
          saveDraft(row);
          row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      const del = e.target.closest("[data-term-delete]");
      if (!del || del.disabled) return;
      const rec = recordsById.get(del.dataset.termDelete);
      if (!rec || !confirm("確定刪除這筆段考成績嗎？")) return;

      del.disabled = true;
      const originalText = del.textContent;
      del.textContent = "刪除中……";
      try {
        const result = await db.from("term_exam_scores").delete().eq("id", rec.id);
        if (result.error) throw result.error;
        await loadRecords();
        renderRoster();
        showMessage("段考成績已刪除。", "success", true);
      } catch (error) {
        console.error("刪除段考成績失敗：", error);
        alert("刪除段考成績失敗：" + (error?.message || "請稍後再試。"));
      } finally {
        if (del.isConnected) {
          del.disabled = false;
          del.textContent = originalText;
        }
      }
    });
  }catch(error){$("termExamRecords").innerHTML="<div class='system-message error' style='display:block'>讀取段考成績失敗："+escapeHtml(error.message)+"</div>";}
}
