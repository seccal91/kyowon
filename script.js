const goToNaverButton = document.getElementById('goToNaverButton');

if (goToNaverButton) {
  goToNaverButton.addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'dialog-box';

    const title = document.createElement('p');
    title.className = 'dialog-title';
    title.textContent = '수달쌤에게 영수증 받으셨나요?';

    const message = document.createElement('p');
    message.className = 'dialog-message';
    message.textContent = '자랑 후 꼭 캡쳐해서 수달쌤에게 보내주세요!';

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const confirmButton = document.createElement('button');
    confirmButton.className = 'dialog-confirm';
    confirmButton.type = 'button';
    confirmButton.textContent = '확인';

    confirmButton.addEventListener('click', () => {
      window.open('https://m.place.naver.com/my/checkin', '_blank', 'noopener,noreferrer');
      overlay.remove();
    });

    actions.appendChild(confirmButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });
}
