import { REGION_MAP } from "./regions";

// Aliases for major regions (short forms found in addresses)
const MAJOR_ALIASES: Record<string, string> = {
  "서울": "서울특별시",
  "경기": "경기도",
  "인천": "인천광역시",
  "부산": "부산광역시",
  "대구": "대구광역시",
  "대전": "대전광역시",
  "광주": "광주광역시",
  "울산": "울산광역시",
  "세종": "세종특별자치시",
  "강원": "강원특별자치도",
  "충북": "충청북도",
  "충청북": "충청북도",
  "충남": "충청남도",
  "충청남": "충청남도",
  "전북": "전북특별자치도",
  "전라북": "전북특별자치도",
  "전남": "전라남도",
  "전라남": "전라남도",
  "경북": "경상북도",
  "경상북": "경상북도",
  "경남": "경상남도",
  "경상남": "경상남도",
  "제주": "제주특별자치도",
};

export interface ParsedRegion {
  major: string;
  minor: string | null;
}

export function parseAddress(address: string): ParsedRegion | null {
  if (!address) return null;
  const normalizedAddress = address.replace(/\s+/g, "");

  // Try full major name first
  for (const major of Object.keys(REGION_MAP)) {
    if (normalizedAddress.includes(major.replace(/\s+/g, ""))) {
      const minor = findMinor(normalizedAddress, major);
      return { major, minor };
    }
  }

  // Try alias match
  for (const [alias, major] of Object.entries(MAJOR_ALIASES)) {
    if (normalizedAddress.includes(alias.replace(/\s+/g, ""))) {
      const minor = findMinor(normalizedAddress, major);
      return { major, minor };
    }
  }

  // Fallback: match minor only and infer major
  for (const major of Object.keys(REGION_MAP)) {
    const minor = findMinor(normalizedAddress, major);
    if (minor) {
      return { major, minor };
    }
  }

  return null;
}

function findMinor(address: string, major: string): string | null {
  const minors = REGION_MAP[major] ?? [];
  // Prefer longer match to avoid partial hits (e.g. "남구" vs "광산구")
  const sorted = [...minors].sort((a, b) => b.length - a.length);
  for (const minor of sorted) {
    if (address.includes(minor)) return minor;
  }
  return null;
}
