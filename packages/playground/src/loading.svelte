<div class="page-loading">
  <div class="la-square-jelly-box">
    <div />
    <div />
  </div>
  <p>
    <slot>Loading...</slot>
  </p>
</div>

<style>
  .page-loading {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: rgb(51, 51, 51);
    background: rgb(246, 249, 252);
  }

  .la-square-jelly-box {
    width: 150px;
    height: 150px;
    margin-bottom: 25px;
  }

  /*!
   * Load Awesome v1.1.0 (http://github.danielcardoso.net/load-awesome/)
   * Copyright 2015 Daniel Cardoso <@DanielCardoso>
   * Licensed under MIT
   */
  .la-square-jelly-box,
  .la-square-jelly-box > div {
    position: relative;
    box-sizing: border-box;
  }
  .la-square-jelly-box {
    display: block;
    font-size: 0;
    color: #fff;
  }
  .la-square-jelly-box > div {
    display: inline-block;
    float: none;
    background-color: currentColor;
    border: 0 solid currentColor;
  }
  .la-square-jelly-box > div:nth-child(1),
  .la-square-jelly-box > div:nth-child(2) {
    position: absolute;
    left: 0;
    width: 100%;
  }
  .la-square-jelly-box > div:nth-child(1) {
    top: -25%;
    z-index: 1;
    height: 100%;
    border-radius: 10%;
    animation: square-jelly-box-animate 0.6s -0.1s linear infinite;
  }
  .la-square-jelly-box > div:nth-child(2) {
    bottom: -9%;
    height: 10%;
    background: #000;
    border-radius: 50%;
    opacity: 0.2;
    animation: square-jelly-box-shadow 0.6s -0.1s linear infinite;
  }
  /*
 * Animations
 */
  @keyframes square-jelly-box-animate {
    17% {
      border-bottom-right-radius: 10%;
    }
    25% {
      transform: translateY(25%) rotate(22.5deg);
    }
    50% {
      border-bottom-right-radius: 100%;
      transform: translateY(50%) scale(1, 0.9) rotate(45deg);
    }
    75% {
      transform: translateY(25%) rotate(67.5deg);
    }
    100% {
      transform: translateY(0) rotate(90deg);
    }
  }
  @keyframes square-jelly-box-shadow {
    50% {
      transform: scale(1.25, 1);
    }
  }
  @media (prefers-color-scheme: dark) {
    .page-loading {
      color: #eee;
      background-color: #111;
    }
    .la-square-jelly-box {
      color: #333;
    }
    .la-square-jelly-box > div:nth-child(2) {
      background: #222;
    }
  }
</style>
