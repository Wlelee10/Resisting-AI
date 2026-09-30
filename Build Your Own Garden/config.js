/* =========================================
   HUMAN GALLERY 공유 설정 (Supabase)
   두 값을 채우면 모든 방문자가 같은 휴먼 갤러리를 봄
   비워 두면: server.py로 열었을 때는 그 서버에, 아니면 각 브라우저에만 저장

   url: Supabase 프로젝트 주소 (Project Settings → API → Project URL)
   key: 공개용 키 (Project Settings → API → anon / publishable key)
        ※ 공개용 키라서 웹사이트에 들어가도 괜찮음 (service_role 키는 절대 넣지 말 것)
========================================= */

window.GARDEN_CLOUD = {
  url: "",
  key: ""
};
