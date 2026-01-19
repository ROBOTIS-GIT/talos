"use client";

import { useRef, useState, useMemo, useLayoutEffect, useCallback } from "react";
import Convert from "ansi-to-html";
import { useTheme } from "@/contexts/ThemeContext";

interface LogViewerProps {
  logs: string;
  autoScroll?: boolean;
  className?: string;
}

export default function LogViewer({
  logs,
  autoScroll = true,
  className = "",
}: LogViewerProps) {
  // 스크롤이 생기는 외부 컨테이너
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // 사용자가 현재 맨 아래를 보고 있는지 추적 (기본값 true)
  const isAtBottomRef = useRef(true);
  
  // "Scroll to Bottom" 버튼 표시 여부
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  const { theme } = useTheme();

  // 1. ANSI 변환기 초기화 (변경 없음)
  const convert = useMemo(() => {
    const isDark = theme === "dark";
    return new Convert({
      fg: isDark ? "#d4d4d4" : "#333333",
      bg: isDark ? "#1e1e1e" : "#ffffff",
      newline: false,
      escapeXML: true,
      stream: false,
      colors: isDark
        ? {
            0: "#000000", 1: "#cd3131", 2: "#0dbc79", 3: "#e5e510",
            4: "#2472c8", 5: "#bc3fbc", 6: "#11a8cd", 7: "#e5e5e5",
            8: "#666666", 9: "#f14c4c", 10: "#23d18b", 11: "#f5f543",
            12: "#3b8eea", 13: "#d670d6", 14: "#29b8db", 15: "#e5e5e5",
          }
        : {
            0: "#000000", 1: "#cd3131", 2: "#0dbc79", 3: "#e5e510",
            4: "#2472c8", 5: "#bc3fbc", 6: "#11a8cd", 7: "#333333",
            8: "#666666", 9: "#f14c4c", 10: "#23d18b", 11: "#f5f543",
            12: "#3b8eea", 13: "#d670d6", 14: "#29b8db", 15: "#333333",
          },
    });
  }, [theme]);

  // HTML 변환 (변경 없음)
  const htmlLogs = useMemo(
    () => (logs ? convert.toHtml(logs) : "No logs available"),
    [logs, convert]
  );

  // 2. [핵심] 로그가 업데이트될 때마다 스크롤 강제 이동
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    // 만약 사용자가 바닥에 있었다면(isAtBottomRef), 로그 추가 시 강제로 바닥으로 내림
    if (autoScroll && isAtBottomRef.current) {
      // scrollTop에 아주 큰 값을 넣어서 무조건 끝으로 보냄 (scrollHeight 계산보다 확실함)
      container.scrollTop = container.scrollHeight;
    }
  }, [htmlLogs, autoScroll]); // htmlLogs가 바뀌면 실행

  // 3. 사용자가 스크롤할 때 "내가 바닥에 있나?" 감지
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    
    // 바닥 감지 오차 범위를 50px로 넉넉하게 둠 (화면 배율, 폰트 크기 오차 방지)
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const isAtBottom = distanceFromBottom < 50;

    isAtBottomRef.current = isAtBottom;
    setShowScrollButton(!isAtBottom);
  }, []);

  return (
    <div
      className={`relative flex flex-col ${className}`}
      style={{ 
        height: "100%", 
        minHeight: 0,
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* 스크롤 컨테이너(scrollRef)가 스크롤되고, 내부 div는 내용물 역할만 함 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="p-4 rounded"
        style={{
          fontFamily: "monospace",
          fontSize: "12px",
          backgroundColor: theme === "dark" ? "#1e1e1e" : "#ffffff",
          color: theme === "dark" ? "#d4d4d4" : "#333333",
          border: "1px solid var(--vscode-panel-border)",
          overflowY: "auto",
          overflowX: "auto",
          flex: 1,
          height: 0,
          minHeight: 0,
          maxHeight: "100%",
          position: "relative",
          // ⭐ [가장 중요] 브라우저의 스크롤 자동 보정 기능 끄기
          overflowAnchor: "none", 
          scrollBehavior: "auto" // 부드러운 스크롤 끄기 (로그 튀는 원인)
        }}
      >
        <div
          className="font-mono whitespace-pre-wrap break-all"
          style={{
            margin: 0,
            display: "block",
            width: "100%",
            boxSizing: "border-box"
          }}
          dangerouslySetInnerHTML={{ __html: htmlLogs }}
        />

        {/* Scroll to Bottom 버튼은 스크롤 컨테이너 내부에 위치하되, position: absolute로 고정 */}
        {showScrollButton && autoScroll && (
          <button
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                isAtBottomRef.current = true;
                setShowScrollButton(false);
              }
            }}
            className="absolute px-3 py-1 rounded text-xs shadow-md opacity-90 hover:opacity-100"
            style={{
              bottom: "16px",
              right: "16px",
              backgroundColor: "var(--vscode-button-background, #007acc)",
              color: "var(--vscode-button-foreground, white)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s",
              zIndex: 100,
              pointerEvents: "auto",
            }}
          >
            ⬇ Scroll to Bottom
          </button>
        )}
      </div>
    </div>
  );
}