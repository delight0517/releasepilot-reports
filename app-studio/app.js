'use strict';
const form = document.getElementById('request-form');
const kind = document.getElementById('kind');
const status = document.getElementById('status');
const panel = document.getElementById('draft-panel');
const draft = document.getElementById('draft');
function updateKind() {
  const partner = kind.value === 'developer';
  document.getElementById('idea-label').textContent = partner ? '어떤 앱을 만들었고, 어떤 작업을 함께하고 싶나요?' : '어떤 앱을 만들고 싶나요?';
  document.getElementById('idea').placeholder = partner ? '대표 작업, 맡은 역할, 가능한 서비스와 희망 견적을 알려주세요.' : '예: 작은 공방을 운영해요. 수강생에게 수업 준비물을 알려주는 앱이 필요해요.';
}
function invalidateDraft() {
  panel.hidden = true;
  draft.value = '';
  document.getElementById('email').href = 'mailto:rogan2534@gmail.com';
  status.textContent = '';
}
kind.addEventListener('change', updateKind);
form.addEventListener('input', invalidateDraft);
document.getElementById('partner-cta').addEventListener('click', () => {
  kind.value = 'developer';
  updateKind();
  invalidateDraft();
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  const subject = values.kind === 'developer' ? '[App Studio] 개발자 파트너 참여 문의' : '[App Studio] 앱 제작 상담';
  const text = `${subject}\n\n이름: ${values.name.trim()}\n답장 이메일: ${values.reply.trim()}\n\n${values.idea.trim()}\n\n플랫폼 / 포트폴리오: ${values.platform.trim() || '상담하며 정하고 싶어요'}\n\n${values.kind === 'developer' ? '개발자 파트너 참여 방식과 다음 단계를 안내해주세요.' : '얼리 런칭 35,000원 제안의 적용 범위, 외부 비용, 일정, 수정 범위를 상담하고 싶어요.'}`;
  draft.value = text;
  document.getElementById('email').href = `mailto:rogan2534@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  panel.hidden = false;
  status.textContent = '초안이 준비됐어요. 아직 전송되지 않았습니다. 이메일 앱에서 확인 후 보내주세요.';
  draft.focus();
});
document.getElementById('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(draft.value);
    status.textContent = '초안을 복사했어요. 이메일에 붙여넣고 직접 보내주세요. 아직 접수되지 않았습니다.';
  } catch {
    draft.focus();
    draft.select();
    status.textContent = '자동 복사를 사용할 수 없어 초안을 선택했어요. 직접 복사해 보내주세요.';
  }
});
document.getElementById('email').addEventListener('click', () => {
  status.textContent = '이메일 앱 열기를 요청했어요. 열리지 않으면 초안을 복사해 rogan2534@gmail.com으로 보내주세요. 전송 여부는 이 페이지에서 확인할 수 없습니다.';
});
