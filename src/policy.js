const POLICY_VERSION = '1.0'

const templates = {
  nonDiagnosticDisclaimer: '本回答は一般的な健康情報であり、診断・処方ではありません。体調がすぐれない場合や不安が続く場合は、医療機関等にご相談ください。',
  emergencyAdvice: '生命に関わる可能性のある症状が疑われます。意識障害、強い胸痛、呼吸困難、突然の激しい頭痛、大量出血、アナフィラキシー等がある場合は、ただちに119番または地域の救急相談（#7119等）へ連絡してください。',
  careGuidance: '症状が急速に悪化する、強い痛みが続く、脱水が疑われる、乳幼児・高齢者・妊娠中・基礎疾患がある等の場合は、早めの医療機関受診を検討してください。',
  infoShortage(query) {
    return {
      answer: `${this.nonDiagnosticDisclaimer}\n\n情報不足のため、出典に基づく十分な回答を提示できませんでした。以下の点を含めて再度ご質問ください。\n- 具体的な症状・発症時期・経過\n- 年齢・基礎疾患・服用中の薬\n- 受診の可否（平日/夜間など）`,
      sources: [],
      risk: detectRisk(query)
    }
  }
}

function detectRisk(text) {
  const t = (text || '').toString()
  const high = [
    '意識がない', '意識もうろう', 'けいれん', '痙攣', '呼吸できない', '息ができない', '激しい胸痛', '胸が痛い', '突然の激しい頭痛', 'ろれつ', '片麻痺', '顔のゆがみ', '大量出血', '血が止まらない', 'アナフィラキシ', '喉が腫れる', 'ゼーゼー', '窒息', '唇が青い', '自殺', '死にたい', '産後の大量出血', '乳児 38'
  ]
  const medium = [
    '高熱', '39度', '40度', '強い腹痛', '血便', '黒色便', '脱水', '尿が出ない', '3日以上', '一週間以上', '息苦しい', '呼吸が苦しい', '胸が苦しい', '意識がもうろう', '妊娠中', '乳幼児', '高齢者'
  ]
  const reasonsHigh = high.filter(k => t.includes(k))
  if (reasonsHigh.length) return { level: 'high', reasons: reasonsHigh }
  const reasonsMed = medium.filter(k => t.includes(k))
  if (reasonsMed.length) return { level: 'medium', reasons: reasonsMed }
  return { level: 'low', reasons: [] }
}

function detectForbidden(text) {
  const t = (text || '').toString()
  const forbidden = [
    '診断して', '確定診断', '処方して', '薬を出して', '抗生物質を出して', '用量を教えて', '処方箋を出して',
    '違法', '劇薬', '医薬品を販売', '麻薬', '覚醒剤'
  ]
  const matched = forbidden.filter(k => t.includes(k))
  return { matched: matched.length > 0, terms: matched }
}

module.exports = { detectRisk, detectForbidden, templates, POLICY_VERSION }
