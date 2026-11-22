import styles from "./SecurityCard.module.css";
import React from "react";

const SecurityCard = ({ content: { icon: i, name: n, cont: c } }) => {
  return (
    <div className={styles.card}>
      <div className={styles.iconWrapper}>
        <span className={styles.icon}>{i}</span>
      </div>
      <h2>{n}</h2>
      <p>{c}</p>
    </div>
  );
};

export default SecurityCard;
