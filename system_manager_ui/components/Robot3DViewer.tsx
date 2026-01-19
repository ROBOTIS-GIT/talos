"use client";

import { useEffect, useRef, useState } from "react";
import { useROS2TopicWebSocket } from "@/lib/websocket";
import * as THREE from "three";
// @ts-ignore
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// @ts-ignore
import URDFLoader from "urdf-loader";

interface Robot3DViewerProps {
  container: string;
  topic: string;
  className?: string;
}

export default function Robot3DViewer({
  container,
  topic,
  className = "",
}: Robot3DViewerProps) {
  // ... (기본 Refs 설정은 동일) ...
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [robotDescription, setRobotDescription] = useState<string | null>(null);
  const hasReceivedDescriptionRef = useRef<boolean>(false);

  // Use WebSocket to receive robot_description (it's published once at startup)
  // Close WebSocket after receiving data once
  const { topicData, ws } = useROS2TopicWebSocket(container, topic, {
    onError: (err) => console.error("[Robot3DViewer] WebSocket error:", err),
  });

  // topicData 변경 시 robot_description 업데이트 및 WebSocket 닫기
  useEffect(() => {
    if (hasReceivedDescriptionRef.current) return;
    if (!topicData || !topicData.available) return;

    try {
      const data = topicData.data;
      // std_msgs/msg/String has a 'data' field containing the string
      // After conversion, it becomes {data: "actual string"}
      let robotDescriptionStr: string | null = null;

      if (data) {
        if (typeof data === "string") {
          robotDescriptionStr = data;
        } else if (typeof data === "object" && data !== null) {
          // Check if it's a dict with 'data' field (std_msgs/msg/String structure)
          if (data.data && typeof data.data === "string") {
            robotDescriptionStr = data.data;
          } else {
            // Try to find string value in the object
            const values = Object.values(data);
            for (const value of values) {
              if (typeof value === "string" && value.length > 100) {
                robotDescriptionStr = value;
                break;
              }
            }
          }
        }
      }
      
      if (robotDescriptionStr && robotDescriptionStr.length > 0) {
        setRobotDescription(robotDescriptionStr);
        hasReceivedDescriptionRef.current = true;
        
        // Close WebSocket after receiving data (robot_description is published only once)
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
          console.log("[Robot3DViewer] Received robot_description, closing WebSocket");
          ws.close(1000, "Robot description received");
        }
      }
    } catch (e) {
      console.error("[Robot3DViewer] Error parsing topic data:", e);
    }
  }, [topicData, ws]);

  // ... (Three.js 초기화 부분 동일) ...
  useEffect(() => {
    if (containerRef.current && !rendererRef.current) {
        const width = 500; const height = 400;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1e1e1e);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(50, width/height, 0.1, 1000);
        camera.position.set(1.5, 1.5, 1.5);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

         scene.add(new THREE.AmbientLight(0xffffff, 0.5));
         const dirLight = new THREE.DirectionalLight(0xffffff, 1);
         dirLight.position.set(5, 10, 5);
         dirLight.castShadow = true;
         scene.add(dirLight);

         // 바닥(지면) 추가
         const groundSize = 20;
         const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
         const groundMaterial = new THREE.MeshStandardMaterial({ 
           color: 0x333333,
           roughness: 0.8,
           metalness: 0.2
         });
         const ground = new THREE.Mesh(groundGeometry, groundMaterial);
         ground.rotation.x = -Math.PI / 2; // 평면을 수평으로
         ground.position.y = 0;
         ground.receiveShadow = true;
         scene.add(ground);

         // 그리드 헬퍼 추가 (바닥 위에 격자 표시)
         const gridHelper = new THREE.GridHelper(groundSize, 20, 0x888888, 0x444444);
         gridHelper.position.y = 0.01; // 바닥보다 약간 위에
         scene.add(gridHelper);

         // 좌표축 헬퍼 추가
         const axesHelper = new THREE.AxesHelper(2);
         scene.add(axesHelper);

         // 그림자 활성화
         renderer.shadowMap.enabled = true;
         renderer.shadowMap.type = THREE.PCFSoftShadowMap;

         const controls = new OrbitControls(camera, renderer.domElement);
        controlsRef.current = controls;

        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();
    }

    return () => {
        // ... (Cleanup 코드 동일) ...
    };
  }, []);

  // URDF 로딩 및 카메라 조정
  useEffect(() => {
    if (!robotDescription || !sceneRef.current || !cameraRef.current || !rendererRef.current) {
      console.log("[Robot3DViewer] URDF effect skipped:", {
        hasRobotDescription: !!robotDescription,
        hasScene: !!sceneRef.current,
        hasCamera: !!cameraRef.current,
        hasRenderer: !!rendererRef.current,
      });
      return;
    }

    console.log("[Robot3DViewer] Starting URDF load, length:", robotDescription.length);

    // 기존 모델 삭제 및 정리
    const toRemove: THREE.Object3D[] = [];
    sceneRef.current.traverse((c) => {
      if (c.userData.isUrdfRobot) {
        toRemove.push(c);
      }
    });
    toRemove.forEach((c) => {
      sceneRef.current?.remove(c);
      // 메시 리소스 정리
      c.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    console.log("[Robot3DViewer] Removed", toRemove.length, "previous robot(s)");

    try {
      // 1. LoadingManager 생성 (메시 로딩 완료 감지)
      const manager = new THREE.LoadingManager();
      
      let loadedCount = 0;
      let errorCount = 0;
      
      manager.onLoad = () => {
        console.log("[Robot3DViewer] All meshes loaded! Adjusting camera...");
        
        // 로봇을 찾음
        const robot = sceneRef.current?.children.find((c) => c.userData.isUrdfRobot);
        
        if (robot && cameraRef.current && controlsRef.current && rendererRef.current) {
          const box = new THREE.Box3().setFromObject(robot);
          if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 1);
            const distance = maxDim * 2.5;
            
            console.log("[Robot3DViewer] Camera adjustment:", {
              center: center.toArray(),
              size: size.toArray(),
              distance,
            });
            
            // 카메라 위치 재조정
            cameraRef.current.position.set(
              center.x + distance * 0.7,
              center.y + distance * 0.7,
              center.z + distance * 0.7
            );
            cameraRef.current.lookAt(center);
            cameraRef.current.updateProjectionMatrix();
            
            // 컨트롤 타겟 변경
            controlsRef.current.target.copy(center);
            controlsRef.current.update();
            
            // 렌더링
            if (sceneRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
          }
        }
      };
      
      manager.onProgress = (url, loaded, total) => {
        loadedCount = loaded;
        console.log(`[Robot3DViewer] Loading progress: ${loaded}/${total} - ${url}`);
      };
      
      manager.onError = (url) => {
        errorCount++;
        console.error(`[Robot3DViewer] Failed to load asset: ${url}`);
      };

      // 2. URDFLoader 생성
      const loader = new URDFLoader(manager);

      // 3. 패키지 경로 매핑 설정
      loader.packages = {
        'ffw_description': '/assets/ffw_description',
      };
      
      console.log("[Robot3DViewer] Package mapping:", loader.packages);
      console.log("[Robot3DViewer] Testing mesh path:", '/assets/ffw_description/meshes/ffw_sg2_rev1_follower/base_mobile_assy.stl');

      // 4. URDF 파싱
      const robot = loader.parse(robotDescription);
      robot.userData.isUrdfRobot = true;
      
      console.log("[Robot3DViewer] URDF parsed successfully");
      console.log("[Robot3DViewer] Robot children count:", robot.children.length);
      console.log("[Robot3DViewer] Robot position:", robot.position);
      console.log("[Robot3DViewer] Robot rotation:", robot.rotation);
      
      // 회전 보정 (ROS Z-up -> Three.js Y-up)
      robot.rotation.x = -Math.PI / 2;
      
      if (sceneRef.current) {
        sceneRef.current.add(robot);
        console.log("[Robot3DViewer] Robot added to scene, waiting for meshes to load...");
      }

    } catch (error) {
      console.error("[Robot3DViewer] URDF Loading Error:", error);
      if (error instanceof Error) {
        console.error("[Robot3DViewer] Error message:", error.message);
        console.error("[Robot3DViewer] Error stack:", error.stack);
      }
    }
  }, [robotDescription]);

  return (
    // ... (JSX 동일) ...
    <div className={`relative border rounded overflow-hidden ${className}`} style={{width:"500px", height:"400px"}}>
        <div ref={containerRef} style={{width:"100%", height:"100%"}} />
    </div>
  );
}