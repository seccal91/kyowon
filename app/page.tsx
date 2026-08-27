import Link from "next/link";

const scheduleRows = [
  { label: "이벤트 기간", value: "2026. 9. 7(월) ~ 10. 2(금)" },
  { label: "당첨자 발표", value: "2026. 10. 16(금)" },
];

const rewardItems = [
  { rank: "1", badge: "gold", amount: "10명", prize: "신세계 상품권 5만원", accent: "#f4c84b" },
  { rank: "2", badge: "silver", amount: "20명", prize: "올리브영 모바일상품권 3만원", accent: "#9bb5c8" },
  { rank: "3", badge: "bronze", amount: "30명", prize: "다이소 모바일금액권 1만원", accent: "#c68b5d" },
  { rank: "4", badge: "bronze", amount: "500명", prize: "메가커피 아이스 아메리카노", accent: "#b7a087" },
];

export default function HomePage() {
  return (
    <main className="public-event-page">
      <section className="event-poster">
        <header className="topbar">
          <div className="brand-mark">
            <span className="brand-kyo">KYO</span>
            <span className="brand-won">WON</span>
            <span className="brand-sub">교원</span>
          </div>
          <div className="brand-badge">수학의 달인</div>
        </header>

        <div className="poster-headline-wrap">
          <h1 className="poster-title">우리 수달쌤을<br />자랑해주세요!</h1>
        </div>

        <div className="signboard">
          <p>동네 사장님!!!</p>
          <p>우리 수달 선생님 너무 좋아요!!!</p>
          <p>가이 알아가요~♡</p>
        </div>

        <div className="mascot-wrap" aria-hidden="true">
          <div className="mascot">
            <div className="ear ear-left" />
            <div className="ear ear-right" />
            <div className="face">
              <div className="eye eye-left" />
              <div className="eye eye-right" />
              <div className="nose" />
              <div className="mouth" />
            </div>
          </div>
        </div>

        <div className="detail-banner">
          <span>네이버 리뷰 이벤트</span>
          <strong>우리 수달쌤 자랑을 리뷰로 남겨주세요.</strong>
        </div>
      </section>

      <section className="event-info-section">
        <div className="section-header">수달쌤 자랑대회</div>

        <div className="schedule-list">
          {scheduleRows.map((row) => (
            <div key={row.label} className="schedule-row">
              <div className="schedule-label">{row.label}</div>
              <div className="schedule-value">{row.value}</div>
            </div>
          ))}
        </div>

        <div className="howto-box">
          <div className="howto-title">참여 방법</div>
          <ol className="howto-list">
            <li>QR코드 스캔 or 링크 접속</li>
            <li>[영수증] 버튼 터치 후 영수증 사진 선택</li>
            <li>‘이 장소가 맞아요’ 터치</li>
            <li>원장님과 학원 자랑 후 ‘리뷰 등록하기’</li>
            <li>작성한 리뷰 캡처 후 원장님에게 보내기!</li>
          </ol>

          <div className="qr-panel">
            <div className="qr-box" aria-label="QR code" />
            <div className="qr-label">참여 QR</div>
          </div>
        </div>

        <div className="cta-wrap">
          <Link
            href="https://m.place.naver.com/my"
            target="_blank"
            rel="noreferrer"
            className="primary-cta"
          >
            이벤트 자랑하러 가기
          </Link>
        </div>

        <div className="reward-box">
          <div className="reward-header">이벤트 경품</div>
          <div className="reward-grid">
            {rewardItems.map((item) => (
              <div key={item.rank} className="reward-card">
                <div className="reward-rank" style={{ background: item.accent }}>
                  {item.rank}
                </div>
                <div className="reward-prize">{item.amount}</div>
                <div className="reward-name">{item.prize}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
