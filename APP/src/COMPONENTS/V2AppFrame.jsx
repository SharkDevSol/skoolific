const V2AppFrame = ({ path }) => {
  return (
    <iframe
      src={`https://v2.skoolific.com/${path}`}
      style={{ width: '100%', height: 'calc(100vh - 0px)', border: 'none', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: '#fff' }}
      title="v2app"
    />
  );
};

export default V2AppFrame;
