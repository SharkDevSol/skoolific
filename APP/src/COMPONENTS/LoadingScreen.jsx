import React from 'react';
import { motion } from 'framer-motion';
import styles from './LoadingScreen.module.css';

const LoadingScreen = () => {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.content}>
        {/* Animated Logo */}
        <motion.div
          className={styles.logoContainer}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <motion.img
            src="/oneco.png"
            alt="ONECO Logo"
            className={styles.logo}
            animate={{ 
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </motion.div>

        {/* Subtitle */}
        <motion.p
          className={styles.subtitle}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          SCHOOL MANAGEMENT SYSTEM
        </motion.p>

        {/* Pencil Loader */}
        <svg
          className={styles.pencil}
          viewBox="0 0 200 200"
          width="200px"
          height="200px"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id="pencil-eraser">
              <rect rx="5" ry="5" width="30" height="30"></rect>
            </clipPath>
          </defs>
          <circle
            className={styles.pencilStroke}
            r="70"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="439.82 439.82"
            strokeDashoffset="439.82"
            strokeLinecap="round"
            transform="rotate(-113,100,100)"
          ></circle>
          <g className={styles.pencilRotate} transform="translate(100,100)">
            <g fill="none">
              <circle
                className={styles.pencilBody1}
                r="64"
                stroke="hsl(30, 30%, 50%)"
                strokeWidth="30"
                strokeDasharray="402.12 402.12"
                strokeDashoffset="402"
                transform="rotate(-90)"
              ></circle>
              <circle
                className={styles.pencilBody2}
                r="74"
                stroke="hsl(30, 30%, 60%)"
                strokeWidth="10"
                strokeDasharray="464.96 464.96"
                strokeDashoffset="465"
                transform="rotate(-90)"
              ></circle>
              <circle
                className={styles.pencilBody3}
                r="54"
                stroke="hsl(30, 30%, 40%)"
                strokeWidth="10"
                strokeDasharray="339.29 339.29"
                strokeDashoffset="339"
                transform="rotate(-90)"
              ></circle>
            </g>
            <g className={styles.pencilEraser} transform="rotate(-90) translate(49,0)">
              <g className={styles.pencilEraserSkew}>
                <rect
                  fill="hsl(30, 20%, 90%)"
                  rx="5"
                  ry="5"
                  width="30"
                  height="30"
                ></rect>
                <rect
                  fill="hsl(30, 20%, 85%)"
                  width="5"
                  height="30"
                  clipPath="url(#pencil-eraser)"
                ></rect>
                <rect fill="hsl(30, 20%, 80%)" width="30" height="20"></rect>
                <rect fill="hsl(30, 20%, 75%)" width="15" height="20"></rect>
                <rect fill="hsl(30, 20%, 85%)" width="5" height="20"></rect>
                <rect fill="hsla(30, 20%, 75%, 0.2)" y="6" width="30" height="2"></rect>
                <rect
                  fill="hsla(30, 20%, 75%, 0.2)"
                  y="13"
                  width="30"
                  height="2"
                ></rect>
              </g>
            </g>
            <g className={styles.pencilPoint} transform="rotate(-90) translate(49,-30)">
              <polygon fill="hsl(33,90%,70%)" points="15 0,30 30,0 30"></polygon>
              <polygon fill="hsl(33,90%,50%)" points="15 0,6 30,0 30"></polygon>
              <polygon fill="hsl(223,10%,10%)" points="15 0,20 10,10 10"></polygon>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};

export default LoadingScreen;
