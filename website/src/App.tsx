import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Design8 from './pages/Design8'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Design8 />} />
        <Route path="*" element={<Design8 />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
