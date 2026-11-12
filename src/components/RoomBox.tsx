import type { ReactNode } from "react";
import "./RoomBox.css";

type RoomBoxProps = {
  /** Where it stands on the floor, from the room's centre: right, and towards
      the viewer. In px, like every size here. */
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  /** The colour of the top; the sides are shaded from it. */
  color: string;
  /** Stands on top of the box, at its centre. */
  children?: ReactNode;
};

/** A solid box standing on the room's floor. Its height can change: the box
    grows or shrinks to it. */
function RoomBox({
  x,
  z,
  width,
  depth,
  height,
  color,
  children,
}: RoomBoxProps) {
  const wide = { left: -width / 2, width, height };
  const deep = { left: -depth / 2, width: depth, height };
  return (
    <div
      className="room-box"
      style={{ transform: `translate3d(${x}px, 0, ${z}px)`, color }}
    >
      <div
        className="room-box-face is-back"
        style={{
          ...wide,
          transform: `rotateY(180deg) translateZ(${depth / 2}px)`,
        }}
      />
      <div
        className="room-box-face is-side"
        style={{
          ...deep,
          transform: `rotateY(-90deg) translateZ(${width / 2}px)`,
        }}
      />
      <div
        className="room-box-face is-side"
        style={{
          ...deep,
          transform: `rotateY(90deg) translateZ(${width / 2}px)`,
        }}
      />
      <div
        className="room-box-face is-front"
        style={{ ...wide, transform: `translateZ(${depth / 2}px)` }}
      />
      <div
        className="room-box-face is-top"
        style={{
          left: -width / 2,
          width,
          height: depth,
          bottom: height - depth / 2,
          transform: "rotateX(90deg)",
        }}
      />
      <div className="room-box-roof" style={{ bottom: height }}>
        {children}
      </div>
    </div>
  );
}

export default RoomBox;
