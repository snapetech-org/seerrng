from pathlib import Path
import json
root=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2200-2299-primary-20261102')
data=json.loads((root/'primary-candidates.json').read_text())
C={int(k):v for k,v in data['candidates'].items()}; WHY={int(k):v for k,v in data['rationales'].items()}
agent=Path('/mnt/disks/scratch/task-scratch/seerrng-pr418-window-2200-2299-language-audit-agent-20261102/cell-verdicts.jsonl')
rows=[json.loads(x) for x in agent.read_text().splitlines()]
merged=0; unchanged=0; conflicts=[]
for x in rows:
 if x.get('disposition')!='propose-correction' or x.get('candidateTarget') is None: continue
 if x['candidateTarget']==x['currentTarget']:
  unchanged+=1; continue
 pos=int(x['sourcePosition']); loc=x['locale']; old=C.get(pos,{}).get(loc)
 if old is not None and old!=x['candidateTarget']: conflicts.append((pos,loc,old,x['candidateTarget']))
 C.setdefault(pos,{})[loc]=x['candidateTarget']; merged+=1
 if pos not in WHY and x.get('rationale'): WHY[pos]=x['rationale']
overrides={
 (2202,'vi'):'Xem trailer',(2201,'hi'):'<strong>{title}</strong> को देखने की सूची में सफलतापूर्वक जोड़ दिया गया!',(2201,'vi'):'<strong>{title}</strong> đã được thêm vào danh sách theo dõi thành công!',(2218,'ar'):'تمت المشاهدة',(2218,'hi'):'देखा जा चुका',(2219,'ar'):'الفنان',(2220,'ar'):'لا يوجد فنانون مطابقون.',(2221,'hi'):'कलाकार खोज उपलब्ध नहीं है। फिर से प्रयास करें।',(2222,'ar'):'ابحث عن فنانين…',(2244,'hi'):'MusicBrainz रेटिंग: {score} ({votes} वोट)',(2244,'vi'):'Đánh giá MusicBrainz: {score} từ {votes} lượt bình chọn',(2255,'vi'):'Nghệ sĩ của bản nhạc',(2256,'ar'):'عدد المقطوعات',(2256,'hi'):'ट्रैक की संख्या',(2256,'vi'):'Số bản nhạc',(2258,'vi'):'Thêm vào danh sách theo dõi',(2259,'hi'):'यह शीर्षक ब्लॉकलिस्ट में है।',(2259,'vi'):'Tiêu đề này nằm trong danh sách chặn.',(2262,'ar'):'لم يتم إعداد أي خدمة موسيقى FLAC.',(2262,'hi'):'कोई FLAC संगीत सेवा कॉन्फ़िगर नहीं की गई है।',(2266,'ar'):'لم يتم إعداد أي خدمة موسيقى MP3.',(2266,'hi'):'कोई MP3 संगीत सेवा कॉन्फ़िगर नहीं की गई है।',(2266,'vi'):'Chưa cấu hình dịch vụ nhạc MP3 nào.',(2268,'vi'):'Xóa khỏi danh sách theo dõi',(2270,'ar'):'اطلب قائمة إصدارات الفنان',(2270,'hi'):'डिस्कोग्राफी का अनुरोध करें',(2277,'ar'):'{source}: {score}/{scale}، متوسط تقييم {count} من أصل {total} ألبومًا. لا تُحتسب الألبومات التي لا تتوفر لها تقييمات.',(2277,'hi'):'{source}: {score}/{scale}, कुल {total} में से रेटिंग वाले {count} एल्बमों का औसत। बिना रेटिंग वाले एल्बमों को शामिल नहीं किया जाता।',(2277,'id'):'{source}: {score}/{scale}, rata-rata dari {count} album berperingkat dari total {total} album. Album tanpa rating tidak dihitung.',(2277,'vi'):'{source}: {score}/{scale}, trung bình của {count} album có đánh giá trên tổng số {total} album. Không tính các album thiếu đánh giá.',(2278,'ar'):'تقييم Discogs يخص الإصدار المرتبط أو الإصدار الرئيسي في مدخل النسخة الرئيسية، وليس كل طبعة.',(2278,'id'):'Rating Discogs berlaku untuk rilis yang ditautkan atau rilis utama pada entri master, bukan untuk setiap edisi.',(2278,'vi'):'Đánh giá trên Discogs áp dụng cho bản phát hành được liên kết hoặc bản phát hành chính của mục master, không phải cho mọi ấn bản.',(2279,'hi'):'{source}: {score}/{scale} ({votes} वोटों के आधार पर)।',(2279,'vi'):'{source}: {score}/{scale} từ {votes} lượt bình chọn.',(2285,'hi'):'मुद्दे पर टिप्पणी',(2287,'hi'):'मुद्दा रिपोर्ट किया गया',(2289,'hi'):'मुद्दा फिर से खोला गया',(2291,'hi'):'मुद्दा हल किया गया',(2298,'ar'):'تلقي إشعار عند تقديم طلبات وسائط جديدة تلقائيًا لعناصر موجودة في قائمة متابعتك.',(2298,'hi'):'जब आपकी देखने की सूची के आइटमों के लिए नए मीडिया अनुरोध अपने-आप सबमिट किए जाते हैं, तब आपको सूचित किया जाएगा।',(2298,'vi'):'Nhận thông báo khi yêu cầu phương tiện mới được gửi tự động cho các mục trong danh sách theo dõi của bạn.'}
for (pos,loc),target in overrides.items(): C.setdefault(pos,{})[loc]=target
# Keep the repeated movie and music release-date labels consistent.
C.setdefault(2250,{})['ar']=C[2211]['ar']; C[2250]['vi']=C[2211]['vi']; C[2250]['zh_Hant']=C[2211]['zh_Hant']
WHY[2250]='This is the music release-date field, not a generic date or a release action. The Traditional Chinese value also incorrectly uses simplified glyphs.'
# Drop any rationale not attached to a proposed row and ensure all proposals have one.
for x in rows:
 pos=int(x['sourcePosition'])
 if pos in C and pos not in WHY and x.get('rationale'): WHY[pos]=x['rationale']
WHY={k:v for k,v in WHY.items() if k in C}
by={(int(x['sourcePosition']),x['locale']):x for x in map(json.loads,(root/'source-current-cells.jsonl').read_text().splitlines())}
for pos,locmap in C.items():
 for loc,target in locmap.items():
  assert (pos,loc) in by,(pos,loc)
  assert target != by[(pos,loc)]['currentTarget'],(pos,loc,'unchanged proposal')
assert set(C)==set(WHY),(sorted(set(C)-set(WHY)),sorted(set(WHY)-set(C)))
(root/'primary-candidates.json').write_text(json.dumps({'schemaVersion':1,'candidates':{str(k):v for k,v in sorted(C.items())},'rationales':{str(k):WHY[k] for k in sorted(WHY)}},ensure_ascii=False,indent=2,sort_keys=True)+'\n')
print('agent candidates merged',merged,'same-current pseudo proposals skipped',unchanged,'conflicts resolved',len(conflicts),'final candidate cells',sum(len(x) for x in C.values()),'positions',len(C))
for x in conflicts: print(x)
