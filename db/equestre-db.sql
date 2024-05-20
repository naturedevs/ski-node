/*
 Navicat Premium Data Transfer

 Source Server         : local
 Source Server Type    : MySQL
 Source Server Version : 100135
 Source Host           : localhost:3306
 Source Schema         : ski-db

 Target Server Type    : MySQL
 Target Server Version : 100135
 File Encoding         : 65001

 Date: 06/10/2019 23:02:02
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for tb_events
-- ----------------------------
DROP TABLE IF EXISTS `tb_events`;
CREATE TABLE `tb_events`  (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT 'key',
  `eventName` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `eventDate` datetime(0) NOT NULL DEFAULT '2000-01-01 00:00:00',
  `title` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `titleStart` datetime(0) NOT NULL,
  `titleEnd` datetime(0) NOT NULL,
  `roundNumber` tinyint(4) NOT NULL,
  `jumpoffNumber` tinyint(4) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 8 CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for tb_horses
-- ----------------------------
DROP TABLE IF EXISTS `tb_horses`;
CREATE TABLE `tb_horses`  (
  `eventId` int(11) NOT NULL,
  `number` int(11) NOT NULL,
  `name` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `age` int(11) NULL DEFAULT NULL,
  `birthday` datetime(0) NULL DEFAULT NULL,
  `owner` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  PRIMARY KEY (`eventId`, `number`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for tb_ranks
-- ----------------------------
DROP TABLE IF EXISTS `tb_ranks`;
CREATE TABLE `tb_ranks`  (
  `eventId` int(11) NOT NULL,
  `number` int(11) NOT NULL,
  `rank` int(11) NOT NULL,
  `point1` int(11) NULL DEFAULT NULL,
  `pointPlus1` int(11) NULL DEFAULT NULL,
  `time1` int(11) NULL DEFAULT NULL,
  `timePlus1` int(11) NULL DEFAULT NULL,
  `point2` int(11) NULL DEFAULT NULL,
  `pointPlus2` int(11) NULL DEFAULT NULL,
  `time2` int(11) NULL DEFAULT NULL,
  `timePlus2` int(11) NULL DEFAULT NULL,
  `jumpOff` tinyint(4) NULL DEFAULT NULL,
  PRIMARY KEY (`eventId`, `number`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for tb_riders
-- ----------------------------
DROP TABLE IF EXISTS `tb_riders`;
CREATE TABLE `tb_riders`  (
  `eventId` int(11) NOT NULL,
  `number` int(11) NOT NULL,
  `firstName` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `lastName` varchar(256) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `nation` varchar(32) CHARACTER SET utf8 COLLATE utf8_general_ci NULL DEFAULT NULL,
  `birthday` datetime(0) NULL DEFAULT NULL,
  PRIMARY KEY (`eventId`, `number`) USING BTREE
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Compact;

-- ----------------------------
-- Table structure for tb_startlist
-- ----------------------------
DROP TABLE IF EXISTS `tb_startlist`;
CREATE TABLE `tb_startlist`  (
  `eventId` int(255) NULL DEFAULT NULL,
  `pos` int(255) NULL DEFAULT NULL,
  `num` int(11) NULL DEFAULT NULL,
  `horse_idx` int(255) NULL DEFAULT NULL,
  `rider_idx` int(255) NULL DEFAULT NULL
) ENGINE = InnoDB CHARACTER SET = utf8 COLLATE = utf8_general_ci ROW_FORMAT = Compact;

SET FOREIGN_KEY_CHECKS = 1;
